# SpindleOps — Gestão Operacional & Financeira (Reparo de Spindles e Motores)

SPA React para uma empresa de reparo de spindles e motores industriais: equipe, agenda/rotas de campo,
ordens de compra (POs) e hub financeiro (spindles, cotações, forecast). Dados persistidos localmente
(`localStorage`) através de uma camada de repositório desacoplada.

## Comandos

| Comando             | O que faz                                         |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Servidor de desenvolvimento Vite                  |
| `npm run typecheck` | `tsc --noEmit` (TypeScript estrito)               |
| `npm run build`     | Typecheck + build de produção em `dist/`          |
| `npm run preview`   | Serve o build de produção                         |

**Regra:** ao final de cada fase/alteração relevante, `npm run build` deve passar sem erros.

## Stack

- React 18 + TypeScript (strict, `noUncheckedIndexedAccess`) + Vite
- Tailwind CSS v4 (`@tailwindcss/vite`), dark mode por classe `.dark` em `<html>` (`@custom-variant dark`)
- `lucide-react` (ícones), `@dnd-kit/core` (drag-and-drop), `recharts` (gráficos), `xlsx` (exportação Excel)
- Sem router externo: roteador por hash em `src/app/router.ts` (`#/rota?open=<id>` para deep-link)

> `xlsx` vem do registro npm (0.18.5) porque o CDN oficial do SheetJS está bloqueado neste ambiente.
> É usado **apenas para escrita** (exportação), o que evita as vulnerabilidades conhecidas de parsing.

## Estrutura

```
src/
├─ main.tsx                 # bootstrap: db.ensureInitialized() + providers
├─ App.tsx                  # switch de páginas pela rota
├─ index.css                # Tailwind, tokens (brand = amber), classes .card/.input/.th/.td
├─ app/
│  ├─ router.ts             # useRoute(), navigate(path, params), clearParams()
│  └─ theme.tsx             # ThemeProvider/useTheme (persistido em spindleops:theme)
├─ i18n/                    # Internacionalização (pt-BR, en-US, de-DE)
│  ├─ pt.ts                 # dicionário BASE — fonte da verdade das chaves
│  ├─ en.ts / de.ts         # tipados como `Dictionary` (chave faltando = erro de TS)
│  ├─ types.ts              # Dictionary, TranslationKey (união de chaves pontuadas), Locale
│  └─ index.tsx             # I18nProvider, useI18n() → { t, locale, setLocale }, LOCALES
├─ types/models.ts          # TODOS os modelos de domínio + AppDatabase
├─ data/                    # Camada de persistência (nenhum componente importa localStorage)
│  ├─ storage.ts            # StorageDriver (localStorage c/ fallback em memória)
│  ├─ repository.ts         # Repository<T> + StoredRepository (cache + subscribe)
│  ├─ db.ts                 # repos por coleção + db.snapshot/load/resetToDemo/clearAll
│  ├─ hooks.ts              # useCollection(name) via useSyncExternalStore
│  └─ seed.ts               # buildSeed(today): dados demo com datas RELATIVAS a hoje
├─ domain/                  # Regras de negócio puras + serviços (comandos)
│  ├─ labels.ts             # tons de badge por enum + enumLabel/enumOptions (rótulos vêm do i18n)
│  ├─ employees.ts          # validação, selectors e employeeService
│  └─ calendar.ts           # períodos, conflitos, rotas/Google Maps, activityService (move/reorder)
├─ lib/                     # utilitários (dates, format, id, cn, config)
├─ components/
│  ├─ layout/               # Layout (sidebar fixa + topbar mobile), nav, ComingSoon
│  └─ ui/                   # Button, Badge/StatusBadge, Field/Input/Select, Drawer, Modal/ConfirmDialog, Toast, Popover, misc
└─ modules/                 # Uma pasta por módulo/página
   ├─ calendar/             # CalendarPage (DndContext), CalendarGridView, ScheduleView, ActivityCard,
   │                        # ActivityDrawer, RouteDrawer, CalendarContext
   ├─ employees/            # EmployeesPage, EmployeeFormDrawer
   └─ settings/             # SettingsPage (reset/limpar; backup na Fase 5)
```

## Arquitetura de dados

```
UI (modules/*) ──useCollection()──► Repository<T> ──► StorageDriver ──► localStorage
        │                                ▲
        └──► domain/*Service (comandos) ─┘   (validação e regras de negócio)
```

- **Leitura**: componentes usam `useCollection('employees')`, que retorna um snapshot imutável e
  re-renderiza somente quando a coleção muda.
- **Escrita**: sempre por um serviço de domínio (`employeeService.create(...)`) — nunca chame
  `repos.*` diretamente de componentes quando houver regra de negócio envolvida.
- Chaves no storage: `spindleops:<coleção>` + `spindleops:meta` (`schemaVersion`, `source`, data).
- Trocar o backend (ex.: API REST) = nova implementação de `StorageDriver`/`Repository`.

## Modelos (resumo — fonte da verdade: `src/types/models.ts`)

| Entidade           | Campos-chave                                                                                  | Relações                         |
| ------------------ | --------------------------------------------------------------------------------------------- | -------------------------------- |
| `Employee`         | name, role, phone, email, color (hex), status `active\|inactive`                               | 1—N `CalendarActivity`           |
| `CalendarActivity` | employeeId, customer, address, serviceType, date, startTime, endTime, routeOrder, status        | N—1 Employee; opc. PO e Spindle  |
| `PurchaseOrder`    | poNumber, customerOrVendor, orderDate, requester, paymentTerms, status, notes, attachments[], lines[] | 1—N Activity, 1—N Spindle   |
| `POLineItem`       | lineNumber, partNumber, description, quantity, unitPrice, expected/actualDeliveryDate, status  | embutido na PO                   |
| `SpindleUnit`      | serialNumber, model, manufacturer, customer, quote*, status, deliveryDate, invoicedValue        | opc. N—1 PO; 1—N Activity        |
| `ForecastItem`     | customer, spindleModel, estimatedValue, expectedDate, probability (0–100)                      | —                                |

**Relações bidirecionais**: só o lado "N" guarda a FK (`activity.poId`, `activity.spindleId`,
`spindle.poId`). O lado inverso é resolvido por selectors (ex.: atividades de uma PO = filtro por `poId`).

**Valores derivados nunca são persistidos**: total da linha (`quantity × unitPrice`), total da PO,
valor ponderado do forecast (`estimatedValue × probability/100`), taxa de aprovação, atrasos, conflitos.

## Convenções

- **Datas** como string `YYYY-MM-DD` em horário local; use `src/lib/dates.ts` (nunca `new Date('YYYY-MM-DD')`, que é UTC).
- **Horas** `HH:mm`; comparar via `timeToMinutes`.
- **IDs**: `newId('emp' | 'act' | 'po' | 'pol' | 'att' | 'sp' | 'fc')`.
- **Moeda/locale**: `APP_CONFIG` em `src/lib/config.ts` (padrão `pt-BR` / `BRL`); formate com `src/lib/format.ts`.
- **Nenhum texto de UI hard-coded**: use `const { t } = useI18n()` e `t('modulo.chave', { var })`.
  Ao criar uma chave, adicione-a em `pt.ts` e o TypeScript exigirá a tradução em `en.ts` e `de.ts`.
- **Erros de validação** no domínio retornam `TranslationKey` (não strings), e a UI traduz.
- **Enums** permanecem em inglês no código; rótulo via `enumLabel(t, 'serviceType', v)` / `enumOptions(t, kind)`.
- **Status visuais**: sempre `<StatusBadge kind="activityStatus" value={...} />`.
- **Datas/números** usam o idioma ativo (`setFormatLocale` é chamado pelo I18nProvider); a moeda é fixa (`APP_CONFIG.currency`).
- **Preferências de UI** (visão do calendário, filtros) via `usePersistentState` (`spindleops:ui:*`).
- **Criação/edição**: `Drawer` lateral; **confirmações destrutivas**: `ConfirmDialog`; **feedback**: `useToast()`.
- **Deep-link** para registros: `navigate('/purchase-orders', { open: poId })`; a página lê `params.get('open')`.
- Componentes de página ficam em `modules/<módulo>/`; regras em `domain/<módulo>.ts`.
- Tailwind: tokens `brand-*` (amber) para destaque; sempre prever variantes `dark:`.

## Internacionalização

- Idiomas: 🇧🇷 `pt-BR` (padrão), 🇺🇸 `en-US`, 🇩🇪 `de-DE`. Seletor no rodapé da sidebar; persistido em `spindleops:locale`
  (sem preferência salva, detecta `navigator.language`).
- Dados digitados pelo usuário (clientes, descrições, cargos) **não** são traduzidos.

## Regras de negócio implementadas

- **Colaboradores**: nome e cargo obrigatórios; e-mail válido e único; telefone com DDD (máscara BR);
  cor `#RRGGBB`. Inativos não aparecem para novos agendamentos (`selectActiveEmployees`), mas mantêm histórico.
  Exclusão só é permitida sem atividades vinculadas — caso contrário o sistema oferece **inativar**.
  Ao inativar alguém com atividades futuras, um aviso pede reatribuição na Agenda.
- **Agenda & Rotas** (`domain/calendar.ts`):
  - Visões: `week` (7 dias), `biweekly` (14), `month` (grade de semanas completas), `schedule` (colaborador × dias, 7 ou 14).
  - **Conflito** = mesmo colaborador, mesmo dia, intervalos `[início, fim)` sobrepostos; canceladas são ignoradas.
    Recalculado a cada mudança (cartão com borda vermelha, banner, KPI clicável que filtra só conflitos,
    alerta ao vivo no formulário e toast após drag-and-drop).
  - **Drag-and-drop** (`@dnd-kit/core`, colisão por ponteiro): ids de droppable `day|YYYY-MM-DD` e
    `cell|employeeId|YYYY-MM-DD`. Atividades `completed`/`canceled` são travadas. Não é possível soltar em colaborador inativo.
    A atividade movida vai para o fim da rota de destino e as rotas de origem/destino são renumeradas (1..n).
  - **Rota do dia**: paradas ordenadas por `routeOrder` (↑/↓ ou "ordenar por horário"); URL
    `https://www.google.com/maps/dir/End1/End2/...` (canceladas e sem endereço são excluídas; opção de partir/voltar à base `BASE_ADDRESS`).
  - Inativos não aparecem para novos agendamentos, mas uma atividade antiga de um inativo continua editável.
  - Deep-link: `#/calendar?open=<activityId>` abre a atividade. Chips de PO/Spindle navegam para
    `#/purchase-orders?open=<poId>` / `#/financial?open=<spindleId>` (telas de destino nas Fases 3/4).

## Plano de fases

- [x] **Fase 1** — Setup, CLAUDE.md, layout/navegação, tema claro/escuro, modelos TS, persistência + seed, módulo Colaboradores.
- [x] **Fase 1.5** — Internacionalização pt-BR / en-US / de-DE.
- [x] **Fase 2** — Agenda & Rotas: visões Semanal / Quinzenal / Mensal / Grade Colaborador×Dias; filtros (colaboradores, status);
      drag-and-drop (entre dias e entre colaboradores na grade); ordem de paradas; link Google Maps multi-paradas;
      detecção/destaque de conflitos de horário em tempo real.
- [ ] **Fase 3** — Ordens de Compra: cabeçalho, line items dinâmicos, totais automáticos, linhas atrasadas em vermelho,
      anexos (PDF da PO / invoice / outros), mini-dashboard (POs abertas, entregas em 7 dias, linhas atrasadas).
- [ ] **Fase 4** — Hub Financeiro: spindles/motores, cotações + taxa de aprovação, entregues no mês (filtro mês/ano),
      forecast ponderado, KPIs, gráfico Realizado vs. Forecast, ranking de clientes.
- [ ] **Fase 5** — Navegação cruzada Agenda↔PO↔Spindle, exportação Excel multi-abas
      (`Colaboradores`, `Agenda_Rotas`, `Ordens_Compra`, `Itens_PO`, `Spindles`, `Forecast`), backup/restore JSON
      com validação, revisão final de UX e build de produção.
