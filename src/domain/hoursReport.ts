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

/** Projetos com relatório liberado (concluídos, nada aberto). */
export function completedProjectIds(data: { workPhases: readonly WorkPhase[]; timeEntries: readonly TimeEntry[] }): string[] {
  return [...new Set(data.timeEntries.map((e) => e.projectId))].filter((id) => reportCheck(id, data).ok);
}

/**
 * Horas por funcionário (um ou todos): só projetos concluídos — projeto em andamento não entra (sem relatório parcial).
 */
export function buildEmployeeHoursSheets(employeeId: string | 'all', data: AppDatabase): Record<string, Record<string, unknown>[]> {
  const done = new Set(completedProjectIds(data));
  const prj = new Map(data.projects.map((p) => [p.id, p]));
  const emp = new Map(data.employees.map((e) => [e.id, e]));
  const phaseName = new Map(data.workPhases.map((p) => [p.id, p.name]));
  const entries = data.timeEntries
    .filter((e) => done.has(e.projectId) && (employeeId === 'all' || e.employeeId === employeeId))
    .sort((a, b) => (emp.get(a.employeeId)?.name ?? '').localeCompare(emp.get(b.employeeId)?.name ?? '') || a.start.localeCompare(b.start));
  const people = [...new Set(entries.map((e) => e.employeeId))];
  const sum = (list: TimeEntry[]) => hours(list.reduce((s, e) => s + entryMinutes(e), 0));
  const completedAt = (projectId: string) =>
    jobProgress(projectId, data.workPhases, data.timeEntries).phases.reduce<string | undefined>((m, r) => (r.doneAt && (!m || r.doneAt > m) ? r.doneAt : m), undefined);

  const resumo = people.map((id) => {
    const mine = entries.filter((e) => e.employeeId === id);
    return { Funcionário: emp.get(id)?.name ?? id, Projetos: new Set(mine.map((e) => e.projectId)).size, 'Total de horas': sum(mine) };
  });

  const porProjeto = people.flatMap((id) => {
    const mine = entries.filter((e) => e.employeeId === id);
    return [...new Set(mine.map((e) => e.projectId))].map((pid) => {
      const p = prj.get(pid);
      const list = mine.filter((e) => e.projectId === pid);
      const at = completedAt(pid);
      const row: Record<string, unknown> = {
        Funcionário: emp.get(id)?.name ?? id,
        Projeto: p?.projectNumber ?? pid,
        Cliente: p?.customer ?? '',
        'Projeto concluído em': at ? parseISODate(localDay(at)) : undefined,
      };
      for (const ph of [...data.workPhases].sort((a, b) => a.order - b.order)) {
        const h = sum(list.filter((e) => e.phaseId === ph.id));
        if (h) row[ph.name] = h;
      }
      row.Total = sum(list);
      return row;
    });
  });

  const apontamentos = entries.map((e) => ({
    Funcionário: emp.get(e.employeeId)?.name ?? e.employeeId,
    Data: parseISODate(localDay(e.start)),
    Projeto: prj.get(e.projectId)?.projectNumber ?? '',
    Cliente: prj.get(e.projectId)?.customer ?? '',
    Fase: phaseName.get(e.phaseId) ?? '',
    Início: hhmm(e.start),
    Fim: e.end ? (localDay(e.end) !== localDay(e.start) ? `${localDay(e.end).split('-').reverse().join('/')} ${hhmm(e.end)}` : hhmm(e.end)) : '',
    Horas: hours(entryMinutes(e)),
  }));

  return { Resumo: resumo, Por_Projeto: porProjeto, Apontamentos: apontamentos };
}

/** Todos os projetos concluídos numa planilha: resumo projeto × fase + todos os horários agrupados por projeto. */
export function buildAllProjectsSheets(data: AppDatabase): Record<string, Record<string, unknown>[]> {
  const ids = completedProjectIds(data);
  const prj = new Map(data.projects.map((p) => [p.id, p]));
  const emp = new Map(data.employees.map((e) => [e.id, e]));
  const phases = [...data.workPhases].sort((a, b) => a.order - b.order);
  const phaseName = new Map(phases.map((p) => [p.id, p.name]));
  const ordered = [...ids].sort((a, b) => (prj.get(a)?.projectNumber ?? '').localeCompare(prj.get(b)?.projectNumber ?? ''));
  const resumo = ordered.map((id) => {
    const prog = jobProgress(id, data.workPhases, data.timeEntries);
    const at = prog.phases.reduce<string | undefined>((m, r) => (r.doneAt && (!m || r.doneAt > m) ? r.doneAt : m), undefined);
    const row: Record<string, unknown> = {
      Projeto: prj.get(id)?.projectNumber ?? id,
      Cliente: prj.get(id)?.customer ?? '',
      'Concluído em': at ? parseISODate(localDay(at)) : undefined,
    };
    for (const r of prog.phases) row[r.phase.name] = hours(r.minutes);
    row.Total = hours(prog.phases.reduce((s, r) => s + r.minutes, 0));
    return row;
  });
  const apontamentos = ordered.flatMap((id) =>
    data.timeEntries
      .filter((e) => e.projectId === id)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => ({
        Projeto: prj.get(id)?.projectNumber ?? id,
        Cliente: prj.get(id)?.customer ?? '',
        Fase: phaseName.get(e.phaseId) ?? '',
        Data: parseISODate(localDay(e.start)),
        Colaborador: emp.get(e.employeeId)?.name ?? e.employeeId,
        Início: hhmm(e.start),
        Fim: e.end ? (localDay(e.end) !== localDay(e.start) ? `${localDay(e.end).split('-').reverse().join('/')} ${hhmm(e.end)}` : hhmm(e.end)) : '',
        Horas: hours(entryMinutes(e)),
        'Concluiu a fase': e.completesPhase ? 'Sim' : 'Não',
      })),
  );
  return { Resumo: resumo, Apontamentos: apontamentos };
}

/** Exporta todos os projetos concluídos (uma planilha, organizada por projeto). */
export async function exportAllProjectsReport(): Promise<ExportResult> {
  assertCan('time.manage');
  const data = db.snapshot();
  if (completedProjectIds(data).length === 0) return { ok: false, reason: 'timesheet.noCompleted' };
  const filename = `Horas_por_projeto_${todayISO()}.xlsx`;
  await downloadWorkbook(buildAllProjectsSheets(data), filename);
  return { ok: true, filename };
}

async function downloadWorkbook(sheets: Record<string, Record<string, unknown>[]>, filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    // Cabeçalho = união das chaves (as colunas de fase variam por linha).
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}], { cellDates: true, dateNF: 'dd/mm/yyyy', header: headers });
    ws['!cols'] = headers.map((h) => ({ wch: Math.min(60, Math.max(h.length, ...rows.map((r) => String(r[h] instanceof Date ? '00/00/0000' : (r[h] ?? '')).length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  const url = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type ExportResult = { ok: true; filename: string } | { ok: false; reason: TranslationKey };

/** Relatório de um projeto; recusa serviço não concluído (não existe relatório parcial). */
export async function exportHoursReport(projectId: string): Promise<ExportResult> {
  assertCan('time.manage');
  const data = db.snapshot();
  const check = reportCheck(projectId, data);
  if (!check.ok) return check;
  const project = data.projects.find((p) => p.id === projectId)!;
  const filename = `Horas_${project.projectNumber}_${todayISO()}.xlsx`;
  await downloadWorkbook(buildHoursReportSheets(projectId, data), filename);
  return { ok: true, filename };
}

/** Relatório por funcionário (ou todos), só com projetos concluídos. */
export async function exportEmployeeHoursReport(employeeId: string | 'all'): Promise<ExportResult> {
  assertCan('time.manage');
  const data = db.snapshot();
  const sheets = buildEmployeeHoursSheets(employeeId, data);
  if (!sheets.Apontamentos?.length) return { ok: false, reason: 'timesheet.employeeNoData' };
  const who = employeeId === 'all' ? 'Todos' : (data.employees.find((e) => e.id === employeeId)?.name ?? employeeId).replace(/\s+/g, '_');
  const filename = `Horas_${who}_${todayISO()}.xlsx`;
  await downloadWorkbook(sheets, filename);
  return { ok: true, filename };
}
