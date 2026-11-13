# SpindleOps — Gestão Operacional & Financeira (Reparo de Spindles e Motores)

SPA React para uma empresa de reparo de spindles e motores industriais: equipe, agenda/rotas de campo,
ordens de compra (POs) e hub financeiro (spindles, cotações, forecast). Dados persistidos localmente
(`localStorage`) através de uma camada de repositório desacoplada.

- Aviso de plataforma de teste: `StartupDisclaimer` (ao abrir, 1x por sessão) e `DisclaimerStrip` (faixa fixa no topo e no login), em `components/layout/Disclaimer.tsx`.

## Comandos

| Comando             | O que faz                                         |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Servidor de desenvolvimento Vite                  |
| `npm run typecheck` | `tsc --noEmit` (TypeScript estrito)               |
| `npm run build`     | Typecheck + build de produção em `dist/`          |
| `npm run preview`   | Serve o build de produção                         |
| `npm run build:artifact` | Build + versão de arquivo único em `dist-artifact/spindleops.html` (para publicar como página hospedada) |

**Regra:** ao final de cada fase/alteração relevante, `npm run build` deve passar sem erros.

## Stack

- React 18 + TypeScript (strict, `noUncheckedIndexedAccess`) + Vite
- Tailwind CSS v4 (`@tailwindcss/vite`), dark mode por classe `.dark` em `<html>` (`@custom-variant dark`)
- `lucide-react` (ícones), `recharts` (gráficos), `xlsx` (exportação Excel)
- Drag-and-drop do cronograma com **pointer events nativos** (mover/redimensionar exige geometria por pixel; sem lib)
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
│  ├─ theme.tsx             # ThemeProvider/useTheme (persistido em spindleops:theme)
│  └─ session.ts            # login por PIN, usuário atual, perfis e permissões (can / assertCan / useCan)
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
│  ├─ cloud/                # MODO NUVEM (Supabase)
│  │  ├─ backend.ts         # contrato CloudBackend (auth, perfis, registros, tempo real)
│  │  ├─ supabaseBackend.ts # implementação real (carregada sob demanda)
│  │  ├─ devBackend.ts      # SÓ TESTES: fala com servidor simulado (VITE_FAKE_CLOUD_URL)
│  │  ├─ runtime.ts         # CLOUD (env), backend, syncQueue
│  │  ├─ syncQueue.ts       # fila de gravação: lote, última versão vence, retry com backoff, status
│  │  ├─ remoteRepository.ts# Repository síncrono c/ cache + escrita otimista + applyRemote
│  │  ├─ profilesRepository.ts # users = tabela profiles
│  │  └─ connect.ts         # carga inicial + assinatura do tempo real
│  └─ seed.ts               # buildSeed(today): dados demo com datas RELATIVAS a hoje
├─ domain/                  # Regras de negócio puras + serviços (comandos)
│  ├─ labels.ts             # tons de badge por enum + enumLabel/enumOptions (rótulos vêm do i18n)
│  ├─ employees.ts          # validação, selectors e employeeService
│  ├─ schedule.ts           # cronograma: período, raias, conflitos, férias, arraste, materiais ↔ POs
│  ├─ purchasing.ts         # POs (totais, atrasos, status), último valor, cotações, demanda, prontidão
│  ├─ requisitions.ts       # requisição → PO do SAP → GR (processo de compras)
│  ├─ extensions.ts         # pedidos de extensão de material no SAP (planta origem → HOME_PLANT)
│  ├─ financial.ts          # KPIs do mês, carteira, taxa de aprovação, série Realizado×Forecast, ranking
│  └─ dataExchange.ts       # exportação Excel multi-abas, backup/restore JSON com validação
├─ lib/                     # utilitários (dates, format, id, cn, config)
├─ components/
│  ├─ layout/               # Layout (sidebar fixa + topbar mobile), nav, ComingSoon
│  └─ ui/                   # Button, Badge/StatusBadge, Field/Input/Select, Drawer, Modal/ConfirmDialog, Toast, Popover, misc
└─ modules/                 # Uma pasta por módulo/página
   ├─ calendar/             # SchedulePage, GanttChart (arraste por pointer events), ProjectDrawer (abas),
   │                        # MaterialsTab, PurchaseDrawer (gera PO), AbsenceDrawer
   ├─ auth/                 # LoginScreen
   ├─ financial/            # FinancialPage (abas), ActualForecastChart (recharts), SpindleDrawer, ForecastDrawer
   ├─ extensions/           # ExtensionsPage (tela própria, visual índigo), ExtensionFormDrawer, PlantBadge
   ├─ purchasing/process/   # RequisitionsTab, RequisitionDrawer, NewRequisitionDrawer, RequisitionWizardDrawer, RegisterPODrawer,
   │                        # ReceivingTab, GRDrawer
   ├─ purchasing/           # PurchaseOrdersPage (abas), PODrawer, CatalogTab/CatalogDrawer, ReadinessTab,
   │                        # SuppliersTab, usePurchasingData (lookups compartilhados com o cronograma)
   ├─ employees/            # EmployeesPage, EmployeeFormDrawer
   └─ settings/             # SettingsPage, DataIOSection (Excel/backup/restore), UsersSection
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

| Entidade            | Campos-chave                                                                                   | Relações                                   |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `User`              | name, email, role `master\|logistics\|office`, pinHash, active                                   | autor de requisições, eventos e GRs        |
| `PurchaseRequisition` | number (RC-xxxxx), projectId, requestedBy, neededBy, status, items[] (materialId, PN, qtd), history[] | 1 Projeto; N POs via materiais       |
| `Employee`          | name, role, phone, email, color (hex), status `active\|inactive`                                | 1—N Assignment, 1—N Absence                |
| `Project`           | projectNumber, customer, address, serviceType, description, status, color, materials[]         | opc. PO do cliente e Spindle; 1—N Assignment |
| `ProjectMaterial`   | partNumber, description, quantity, status `to_buy\|ordered\|received`, neededBy                 | opc. `poId` + `poLineId` (PO de compra)    |
| `ProjectAssignment` | projectId, employeeId, startDate, endDate (sempre dias úteis) — a "barra" do cronograma          | N—1 Project, N—1 Employee                  |
| `Absence`           | employeeId, type `vacation\|leave\|training`, startDate, endDate, note — bloqueia a linha       | N—1 Employee                               |
| `Supplier`          | name, contactName, email, phone, notes                                                          | 1—N Offer, 1—N PO de compra                |
| `CatalogMaterial`   | partNumber (chave), description, unit, offers[] (`SupplierOffer`: supplierId, quoteStatus, quotedPrice, validUntil, leadTimeDays) | liga-se a materiais de projeto e linhas de PO **pelo part number** |
| `PurchaseOrder`     | poNumber, **kind `sales\|purchase`**, supplierId?, customerOrVendor, orderDate, requester, paymentTerms, status, notes, attachments[], lines[] | 1—N Project (cliente), 1—N Material (compra) |
| `POLineItem`        | lineNumber, partNumber, description, quantity, unitPrice, expected/actualDeliveryDate, status, receipts[] (GR: grNumber SAP, data, qtd, usuário) | embutido na PO |
| `SpindleUnit`       | serialNumber, model, manufacturer, customer, quote*, status, deliveryDate, invoicedValue         | opc. N—1 PO; 1—N Project                   |
| `ForecastItem`      | customer, spindleModel, estimatedValue, expectedDate, probability (0–100)                       | —                                          |

> `APP_CONFIG.schemaVersion = 5` (v5: extensões de material e `CatalogMaterial.plants`). Antes: v4 (v3: fornecedores, catálogo, `PurchaseOrder.kind`; v4: usuários, requisições, GR, material `requested`).
> O modelo original `CalendarActivity` (atividades diárias com horário/rota) foi substituído na v2 pelo
> cronograma de projetos multi-dia. `APP_CONFIG.schemaVersion = 2`: bases v1 são recriadas com a demo.

**Relações bidirecionais**: só o lado "N" guarda a FK (`project.poId`, `project.spindleId`, `material.poId/poLineId`,
`spindle.poId`). O lado inverso é resolvido por selectors (ex.: projetos de uma PO = filtro por `poId`).

**Valores derivados nunca são persistidos**: total da linha (`quantity × unitPrice`), total da PO,
valor ponderado do forecast (`estimatedValue × probability/100`), taxa de aprovação, atrasos, conflitos.

## Convenções

- **Datas** como string `YYYY-MM-DD` em horário local; use `src/lib/dates.ts` (nunca `new Date('YYYY-MM-DD')`, que é UTC).
- **Horas** `HH:mm`; comparar via `timeToMinutes`.
- **IDs**: `newId('emp' | 'prj' | 'asg' | 'abs' | 'mat' | 'po' | 'pol' | 'att' | 'sp' | 'fc')`.
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
- **Agenda & Rotas = Cronograma de projetos** (`domain/schedule.ts`):
  - Grade estilo Gantt: colaboradores nas linhas × dias nas colunas; visões Semana / Quinzena / Mês.
  - **Fins de semana não são dias de trabalho**: colunas estreitas e acinzentadas; alocações sempre começam/terminam
    em dia útil (`snapForward`/`snapBackward`) e a duração é contada em dias úteis (`businessDaysBetween`).
  - **Arraste** (pointer events): corpo da barra = mover (mantém a duração em dias úteis; também entre linhas = trocar
    colaborador); bordas = redimensionar. Projetos `completed`/`canceled` ficam travados. Prévia em tempo real;
    soltar sobre férias/ausência ou colaborador inativo é **bloqueado** (barra tracejada vermelha + toast).
    Durante o arraste as linhas não encolhem (evita "pulo" sob o ponteiro).
  - **Férias/ausências** (`Absence`): faixa hachurada com cadeado "Férias · até dd/mm" na linha; impede alocações.
    Cadastrar férias por cima de alocações existentes é permitido com aviso (viram conflito).
  - **Conflito** = mesmo colaborador com duas alocações sobrepostas → borda vermelha, banner, KPI que filtra.
  - Sobreposições na mesma linha são empilhadas em raias (`computeLanes`).
  - Ocupação por colaborador (dias alocados / dias úteis disponíveis − ausências) exibida na coluna de nomes.
  - **Materiais do projeto**: status efetivo derivado da linha de PO vinculada (entregue → `received`; aberta → `ordered`;
    sem PO → campo manual). Indicador no retângulo (🛒 a comprar / atrasado / 🚚 aguardando / ✓ OK) abre a aba Materiais.
    "Pode atrasar o projeto" quando a previsão de chegada é posterior a `neededBy` (padrão: início do projeto).
  - **Gerar pedido de compra**: cria uma PO de fornecedor (`PC-xxxxx`) com os materiais selecionados (preço sugerido =
    última compra do mesmo part number) e vincula cada material à sua linha. "Confirmar recebimento" marca a LINHA da PO
    como entregue (data real = hoje) e recalcula o status da PO.
  - Deep-link: `#/calendar?open=<projectId>`. Links para `#/purchase-orders?open=<poId>` e `#/financial?open=<spindleId>`
    (telas de destino nas Fases 3/4). Google Maps: link de busca pelo endereço do projeto.

- **Ordens de Compra & Compras** (`domain/purchasing.ts`):
  - POs de **cliente** (`sales`) e de **compra** (`purchase`, com fornecedor cadastrado). Total da linha e da PO calculados;
    linha atrasada = previsão < hoje e não entregue/cancelada (vermelho). Ao salvar, o status é derivado das linhas
    (`derivePOStatus`), exceto `invoiced`/`canceled`, que são decisões manuais. Excluir uma PO desfaz vínculos.
  - **Último valor pago** = linha mais recente de PO de compra (não cancelada) com o mesmo part number — por fornecedor
    ou geral (`purchaseHistory`/`lastPurchase`). Nunca é armazenado.
  - **Cotação**: cada material do catálogo tem várias ofertas de fornecedores (status não solicitada/solicitada/recebida,
    preço, validade, prazo). Situação do material: `quoted` (alguma cotação válida) > `requested` > `not_quoted`.
    Preço de referência = cotação válida, senão último pago àquele fornecedor; "melhor" = menor preço, desempate por prazo.
    **Data possível de entrega** = hoje + prazo do fornecedor mais rápido.
  - **Material compartilhado**: mesmo part number em 2+ projetos ativos → aviso "Também em PRJ-…" (projeto, checklist, catálogo).
  - **Prontidão ("checklist para iniciar")** por projeto ativo, comparada ao início no cronograma (ou `neededBy`):
    recebido = ok; comprado com previsão ≤ necessidade = aguardando; atrasado ou chega depois = risco;
    a comprar cujo prazo mais rápido não atende = risco; senão a comprar. Projeto: `at_risk` > `to_buy` > `awaiting` > `ready`.
  - Gerar PO pelo projeto usa fornecedor cadastrado (sugere os do catálogo), preço de referência e prazo.
- **Deep-links**: cada página só consome `?open=` quando `useRoute().path` é a dela (evita uma página desmontando
  "roubar" o parâmetro destinado a outra durante a navegação).

- **Usuários e perfis** (`app/session.ts`): login com PIN (SHA-256 com sal por usuário; fallback em JS puro sem `crypto.subtle`).
  - `master`: tudo + usuários + manutenção de dados.
  - `office` (orçamento): cronograma/projetos, colaboradores, materiais dos projetos, criar/cancelar requisições.
  - `logistics`: processar requisições (cotação, registrar PO do SAP, rejeitar), POs, GR, catálogo/cotações, fornecedores.
  - A UI esconde/desabilita (fieldset `disabled`) e os **serviços de domínio chamam `assertCan`** — a regra vale mesmo se a UI falhar.
  - ⚠️ Com localStorage, o PIN só separa perfis no mesmo navegador; uso multiusuário real exige backend compartilhado
    (implementar um `StorageDriver`/repositório remoto e mover a autenticação para ele).
- **Processo de compras** (`domain/requisitions.ts`):
  1. Office seleciona materiais "A comprar" → **requisição** RC-xxxxx (materiais ficam `requested`).
  2. Logística: "Iniciar cotação" → registra cotações no catálogo → cria a PO no SAP → **"Registrar PO do SAP"**
     (nº SAP, fornecedor, preços, previsão; itens podem ir para POs/fornecedores diferentes; nº existente do mesmo
     fornecedor acrescenta linhas). Materiais → `ordered`.
  3. GR no SAP → **"Registrar GR"** aqui (nº do documento SAP, data, quantidades; parcial permitido). Linha fica
     `partial`/`delivered` pela soma dos GRs; materiais e prontidão dos projetos atualizam na hora.
  - Status da requisição: `rejected`/`canceled` manuais; demais derivados dos materiais (enviada → em cotação →
    parcialmente pedida → pedida → parcialmente recebida → recebida). Rejeitar/cancelar devolve materiais sem PO para "A comprar".
  - Cada passo grava `history` (quem, quando, o quê); comentários livres de office e logística.
  - Badge no menu "Ordens de Compra" = requisições pendentes + linhas de compra vencidas sem GR (perfis master/logística).

- **Extensão de material (SAP)** (`domain/extensions.ts`, tela `#/extensions`):
  - Material existe numa planta (ex.: `DE01`, fornecedor alemão) mas não em `HOME_PLANT` (`UK01`, em `lib/config.ts`
    junto com `SAP_PLANTS`). Sem extensão não há PO no SAP.
  - `CatalogMaterial.plants` lista as plantas em que o material existe. `plantState()` → `ok` / `pending` (pedido aberto) /
    `missing` / `unknown` (sem dados → sem alerta).
  - Fluxo: qualquer perfil com `extension.request` pede (EXT-xxxxx) → logística/master (`extension.process`) inicia e conclui
    com referência SAP → a planta destino é adicionada ao catálogo (cria o material se não existir). Histórico e comentários.
  - `PlantBadge` mostra "Não estendido para UK01" + "Pedir extensão" (ou "EXT-… em andamento") em materiais do projeto,
    itens de requisição, catálogo e no assistente. No "Registrar PO do SAP" itens sem extensão vêm desmarcados com aviso.
- **Nova requisição pela tela de Compras** (`RequisitionWizardDrawer`): projeto → materiais "A comprar" (ou adicionar novos,
  com descrição sugerida pelo catálogo) → necessário até/observações → enviar.
- **Drawer/Modal isolam eventos** (`submit`, `click`, `pointerdown`) do portal: no React, eventos de portais sobem pela árvore
  de componentes — sem isso, enviar um formulário aberto a partir de outro formulário enviava os dois.
- **i18n — plural**: textos `"singular || plural"` escolhidos pela variável `count` (ou `days`/`qty`/`late`). Não use "(s)".

- **Hub Financeiro** (`domain/financial.ts`, permissão `financial.edit` = Master e Office; Logística só lê):
  - Valor faturado de uma unidade entregue = `invoicedValue`, senão `quotedValue` (avisado na aba Entregas).
  - "Em aberto / pendente" = valor cotado de unidades aprovadas e ainda não entregues (approved/in_repair/testing);
    o hint soma as cotações enviadas aguardando decisão.
  - Taxa de aprovação = aprovadas ÷ (aprovadas + recusadas) — pendentes/enviadas não entram.
  - Forecast ponderado = valor estimado × probabilidade; KPI soma itens com data prevista entre hoje e +3 meses.
  - Gráfico: barras agrupadas por mês (−5 a +6), uma única escala (moeda). Realizado = faturado pelo mês de entrega;
    forecast = ponderado pelo mês previsto. Cores `--series-actual`/`--series-forecast` (validadas p/ CVD e contraste
    nos dois temas), legenda + tooltip + alternativa em tabela.
  - Ranking: por faturado, desempate por nº de unidades; mostra carteira em aberto e forecast ponderado do cliente.
  - Formulário: cotação aprovada sugere status "Aprovado"; recusada → "Recusado"; status "Entregue" preenche data e valor faturado.

- **Exportação Excel** (`domain/dataExchange.ts`, todos os perfis): abas `Colaboradores`, `Agenda_Rotas`, `Ordens_Compra`,
  `Itens_PO`, `Spindles`, `Forecast` + `Materiais_Projeto`, `Requisicoes`, `Extensoes`, `Fornecedores`, `Catalogo`,
  `Ferias_Ausencias`. Abas e cabeçalhos em pt-BR (independem do idioma da tela); datas como datas do Excel (testado
  em fusos BR/UK/DE); inclui derivados (totais, ponderado, dias úteis, qtd. recebida). `xlsx` é carregado sob demanda
  (import dinâmico); no build de arquivo único (`SINGLE_FILE=1`) o import é embutido.
- **Backup/Restore JSON** (somente Master): `{ app, schemaVersion, exportedAt, data }`. `checkBackup` valida JSON, app,
  versão do schema (precisa ser igual), presença de todas as coleções, campos obrigatórios por coleção, IDs únicos,
  referências (alocações, ausências, requisições, PO/spindle) e existência de Master ativo; mostra prévia com contagens
  antes de substituir tudo. Se o usuário logado não existir no backup, a sessão é encerrada.

## Modo nuvem (Supabase) — Fase 6

- **Login na nuvem (`EMAIL_AUTH` em `cloud/runtime.ts`):** padrão = **PIN** (usuários na coleção `users` de `records`,
  acesso ao banco pela chave anon — exige `supabase/team-pin-mode.sql`; `db.ensureUsers()` cria Master/Logística/Office
  no 1º acesso). `VITE_AUTH_MODE=email` = Supabase Auth + `profiles` (descrito abaixo).
- **Ativação:** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` ⇒ `CLOUD = true`. Sem elas, modo local (localStorage + PIN),
  usado também na página de demonstração.
- **Esquema** (`supabase/schema.sql`): `profiles` (1 por conta do Auth; trigger cria; primeira conta = master, demais
  `pending`) e `records(collection, id, data jsonb)` — um documento por entidade, espelhando os repositórios.
  RLS: `my_role()` (perfil ativo e não pendente) é exigido para ler/gravar `records`; só master altera `profiles`.
  Realtime publicado para as duas tabelas.
- **Sincronização:** os repositórios continuam **síncronos** para o domínio/UI. `RemoteRepository` mantém cache,
  aplica escrita otimista e envia via `SyncQueue` (agrupa por coleção; a última versão de cada id vence; falha ⇒
  devolve à fila e tenta de novo com backoff 1s→30s; evento `online` força envio). Eventos remotos de ids com
  gravação pendente são ignorados (a versão local mais nova prevalece). Conflito entre usuários: último a gravar vence
  por registro. `replaceAll` envia só a diferença. Comparação com JSON de chaves ordenadas (jsonb reordena chaves).
- **Boot:** `CloudGate` → sessão do Supabase → perfil (pendente/inativo ⇒ tela "Aguardando liberação") → `connectCloud()`
  (carga de tudo + tempo real) → `setSessionUser`. Logout encerra a sessão no Supabase e recarrega.
- **Usuários na nuvem:** sem PIN; contas criadas por "Criar conta"; Master define perfil/ativo. Backups não substituem
  contas (`ProfilesRepository.replaceAll` é no-op) e a checagem "Master ativo" do backup não se aplica.
- **Base vazia:** `EmptyCloudBanner` oferece "Restaurar backup" ou "Carregar demonstração" (autorias da demo passam para
  o usuário atual). Metadados em `records` coleção `_meta`.
- **Indicador:** `SyncIndicator` (Sincronizado / Salvando / Sem conexão / Erro: tentando de novo / Reconectando).
  Status do tempo real via `useSyncExternalStore` (evita perder o "conectado" entre render e efeito).
- **Testes:** com `VITE_FAKE_CLOUD_URL` o app usa `devBackend.ts` contra um servidor simulado que imita Auth + RLS +
  Realtime (SSE) — validado: cadastro/pendente/liberação, tempo real entre 2 usuários, falha de rede e reenvio.

## Plano de fases

- [x] **Fase 1** — Setup, CLAUDE.md, layout/navegação, tema claro/escuro, modelos TS, persistência + seed, módulo Colaboradores.
- [x] **Fase 1.5** — Internacionalização pt-BR / en-US / de-DE.
- [x] **Fase 2.1** — Cronograma de projetos (Gantt) com dias úteis, férias bloqueando a linha, arrastar/redimensionar,
      materiais por projeto com geração de PO de compra e confirmação de recebimento (substitui a agenda diária).
- [x] **Fase 2** — Agenda & Rotas: visões Semanal / Quinzenal / Mensal / Grade Colaborador×Dias; filtros (colaboradores, status);
      drag-and-drop (entre dias e entre colaboradores na grade); ordem de paradas; link Google Maps multi-paradas;
      detecção/destaque de conflitos de horário em tempo real.
- [x] **Fase 3** — Ordens de Compra (+ fornecedores, catálogo com cotações e último valor, demanda compartilhada,
      checklist de prontidão dos projetos): cabeçalho, line items dinâmicos, totais automáticos, linhas atrasadas em vermelho,
      anexos (PDF da PO / invoice / outros), mini-dashboard (POs abertas, entregas em 7 dias, linhas atrasadas).
- [x] **Fase 3.1** — Processo de compras (requisição → PO do SAP → GR), usuários com perfis Master/Logística/Office.
- [x] **Fase 3.2** — Botão/assistente de nova requisição, extensões de material SAP (tela própria), revisão do inglês e plurais.
- [x] **Fase 4** — Hub Financeiro: spindles/motores, cotações + taxa de aprovação, entregues no mês (filtro mês/ano),
      forecast ponderado, KPIs, gráfico Realizado vs. Forecast, ranking de clientes.
- [x] **Fase 6** — Modo nuvem (Supabase): login e-mail/senha, perfis com liberação pelo Master, dados compartilhados,
      tempo real, fila offline com reenvio, RLS.
- [x] **Fase 5** — Navegação cruzada Agenda↔PO↔Spindle, exportação Excel multi-abas
      (`Colaboradores`, `Agenda_Rotas`, `Ordens_Compra`, `Itens_PO`, `Spindles`, `Forecast`), backup/restore JSON
      com validação, revisão final de UX e build de produção.
