import { useState } from 'react';
import { CalendarRange, ClipboardList, Cog, Database, LineChart, RotateCcw, Trash2, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { db } from '@/data/db';
import { useCollection } from '@/data/hooks';
import type { CollectionName } from '@/types/models';

const COLLECTION_INFO: Record<CollectionName, { label: string; icon: LucideIcon }> = {
  employees: { label: 'Colaboradores', icon: Users },
  activities: { label: 'Atividades da agenda', icon: CalendarRange },
  purchaseOrders: { label: 'Ordens de compra', icon: ClipboardList },
  spindles: { label: 'Spindles / Motores', icon: Cog },
  forecast: { label: 'Itens de forecast', icon: TrendingUp },
};

function CollectionCount({ name }: { name: CollectionName }) {
  const items = useCollection(name);
  const { label, icon: Icon } = COLLECTION_INFO[name];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <Icon className="size-5 text-slate-400" />
      <span className="flex-1 text-sm">{label}</span>
      <span className="font-semibold tabular-nums">{items.length}</span>
    </div>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const [confirm, setConfirm] = useState<'reset' | 'clear' | null>(null);
  const meta = db.getMeta();

  const run = () => {
    if (confirm === 'reset') {
      db.resetToDemo();
      toast.success('Dados de demonstração restaurados.');
    } else if (confirm === 'clear') {
      db.clearAll();
      toast.success('Todos os dados foram removidos.');
    }
    setConfirm(null);
  };

  return (
    <>
      <PageHeader icon={Database} title="Dados & Backup" description="Persistência local (localStorage) deste navegador." />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Registros armazenados</h2>
          <p className="mb-4 text-sm text-slate-500">
            Origem: <strong>{meta?.source === 'demo' ? 'dados de demonstração' : meta?.source === 'import' ? 'backup importado' : 'base vazia'}</strong>
            {meta && <> · inicializado em {new Date(meta.initializedAt).toLocaleString('pt-BR')}</>}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(COLLECTION_INFO) as CollectionName[]).map((n) => (
              <CollectionCount key={n} name={n} />
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Manutenção da base</h2>
          <p className="mb-4 text-sm text-slate-500">Útil para demonstrações e testes. As ações afetam apenas este navegador.</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-medium">Restaurar dados de demonstração</p>
                <p className="text-xs text-slate-500">Substitui tudo por dados realistas com datas relativas a hoje.</p>
              </div>
              <Button icon={RotateCcw} onClick={() => setConfirm('reset')}>Resetar</Button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900/50 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Limpar todos os dados</p>
                <p className="text-xs text-slate-500">Começa com uma base vazia para uso real.</p>
              </div>
              <Button variant="danger" icon={Trash2} onClick={() => setConfirm('clear')}>Limpar</Button>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">
              <LineChart className="size-4" /> Exportação Excel e Backup/Restore JSON chegam na Fase 5.
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'reset' ? 'Restaurar dados de demonstração?' : 'Limpar todos os dados?'}
        message="Todos os registros atuais serão substituídos. Esta ação não pode ser desfeita (faça um backup antes, se necessário)."
        confirmLabel={confirm === 'reset' ? 'Restaurar demo' : 'Limpar tudo'}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
