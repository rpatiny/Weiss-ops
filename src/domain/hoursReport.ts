/**
 * Relatório de horas por projeto (Excel). Só existe para serviço **concluído**: todas as fases ativas
 * concluídas e nenhum apontamento aberto. Serviço em andamento não tem relatório parcial — a conferência
 * é feita na tela (Horas da oficina → Serviços / Apontamentos).
 */
import { assertCan } from '@/app/session';
import { db } from '@/data/db';
import type { TranslationKey } from '@/i18n/types';
import { parseISODate, todayISO } from '@/lib/dates';
import type { AppDatabase, TimeEntry, WorkPhase } from '@/types/models';
import { entryMinutes, jobProgress, localDay } from './timeTracking';

export type ReportCheck = { ok: true } | { ok: false; reason: TranslationKey };

/** Pode exportar? Serviço concluído e sem apontamento aberto. */
export function reportCheck(projectId: string, data: { workPhases: readonly WorkPhase[]; timeEntries: readonly TimeEntry[] }): ReportCheck {
  const entries = data.timeEntries.filter((e) => e.projectId === projectId);
  if (!jobProgress(projectId, data.workPhases, data.timeEntries).complete) return { ok: false, reason: 'timesheet.errors.notComplete' };
  if (entries.some((e) => !e.end)) return { ok: false, reason: 'timesheet.errors.openEntries' };
  return { ok: true };
}

const hours = (min: number) => Math.round((min / 60) * 100) / 100;
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Abas do relatório (cabeçalhos em pt-BR, como a exportação geral). */
export function buildHoursReportSheets(projectId: string, data: AppDatabase): Record<string, Record<string, unknown>[]> {
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('project not found');
  const emp = new Map(data.employees.map((e) => [e.id, e]));
  const spindle = project.spindleId ? data.spindles.find((s) => s.id === project.spindleId) : undefined;
  const progress = jobProgress(projectId, data.workPhases, data.timeEntries);
  const entries: TimeEntry[] = data.timeEntries.filter((e) => e.projectId === projectId).sort((a, b) => a.start.localeCompare(b.start));
  const phaseName = new Map(data.workPhases.map((p) => [p.id, p.name]));
  const total = entries.reduce((s, e) => s + entryMinutes(e), 0);
  const first = entries[0]?.start;
  const finished = progress.phases.reduce<string | undefined>((m, r) => (r.doneAt && (!m || r.doneAt > m) ? r.doneAt : m), undefined);
  const people = [...new Set(entries.map((e) => e.employeeId))];

  const resumo = [
    { Campo: 'Projeto', Valor: project.projectNumber },
    { Campo: 'Cliente', Valor: project.customer },
    { Campo: 'Descrição', Valor: project.description },
    { Campo: 'Spindle / motor', Valor: spindle ? `${spindle.manufacturer} ${spindle.model} · S/N ${spindle.serialNumber}` : '' },
    { Campo: 'Início na oficina', Valor: first ? `${localDay(first).split('-').reverse().join('/')} ${hhmm(first)}` : '' },
    { Campo: 'Conclusão da última fase', Valor: finished ? `${localDay(finished).split('-').reverse().join('/')} ${hhmm(finished)}` : '' },
    { Campo: 'Total de horas', Valor: hours(total) },
    { Campo: 'Técnicos', Valor: people.map((id) => emp.get(id)?.name ?? id).join(', ') },
    { Campo: 'Fases', Valor: progress.phases.map((r) => r.phase.name).join(' → ') },
    { Campo: 'Gerado em', Valor: `${todayISO().split('-').reverse().join('/')} ${hhmm(new Date().toISOString())}` },
  ];

  const porFase = progress.phases.map((r) => ({
    Ordem: r.phase.order,
    Fase: r.phase.name,
    Horas: hours(r.minutes),
    'Concluída em': r.doneAt ? parseISODate(localDay(r.doneAt)) : undefined,
    Técnicos: r.workers.map((id) => emp.get(id)?.name ?? id).join(', '),
  }));

  // Colaborador × fase (horas), com total por pessoa.
  const porColaborador = people.map((id) => {
    const row: Record<string, unknown> = { Colaborador: emp.get(id)?.name ?? id };
    for (const r of progress.phases) row[r.phase.name] = hours(entries.filter((e) => e.employeeId === id && e.phaseId === r.phase.id).reduce((s, e) => s + entryMinutes(e), 0));
    row.Total = hours(entries.filter((e) => e.employeeId === id).reduce((s, e) => s + entryMinutes(e), 0));
    return row;
  });

  const apontamentos = entries.map((e) => ({
    Data: parseISODate(localDay(e.start)),
    Colaborador: emp.get(e.employeeId)?.name ?? e.employeeId,
    Fase: phaseName.get(e.phaseId) ?? '',
    Início: hhmm(e.start),
    Fim: e.end ? (localDay(e.end) !== localDay(e.start) ? `${localDay(e.end).split('-').reverse().join('/')} ${hhmm(e.end)}` : hhmm(e.end)) : '',
    Horas: hours(entryMinutes(e)),
    'Concluiu a fase': e.completesPhase ? 'Sim' : 'Não',
    Origem: e.source === 'qr' ? 'QR code' : 'Manual (supervisão)',
    Observação: [e.note, e.released ? `Liberado pela supervisão: ${e.released.note}` : ''].filter(Boolean).join(' · '),
  }));

  return { Resumo: resumo, Por_Fase: porFase, Por_Colaborador: porColaborador, Apontamentos: apontamentos };
}

/** Gera e baixa o relatório; recusa serviço não concluído (não existe relatório parcial). */
export async function exportHoursReport(projectId: string): Promise<{ ok: true; filename: string } | { ok: false; reason: TranslationKey }> {
  assertCan('time.manage');
  const data = db.snapshot();
  const check = reportCheck(projectId, data);
  if (!check.ok) return check;
  const project = data.projects.find((p) => p.id === projectId)!;
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(buildHoursReportSheets(projectId, data))) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    const headers = Object.keys(rows[0] ?? {});
    ws['!cols'] = headers.map((h) => ({ wch: Math.min(60, Math.max(h.length, ...rows.map((r) => String(r[h] instanceof Date ? '00/00/0000' : (r[h] ?? '')).length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const filename = `Horas_${project.projectNumber}_${todayISO()}.xlsx`;
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  const url = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { ok: true, filename };
}
