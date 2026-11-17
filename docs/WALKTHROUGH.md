# SpindleOps — Walkthrough das telas

> ✅ **Atualização 17/11/2026:** todos os ajustes da seção 5 foram feitos (ver "Ajustes do walkthrough" no CLAUDE.md),
> mais: horas manuais com confirmação digitada e histórico de mudanças por projeto (Master).

> Revisão de 17/11/2026 (versão `ffa5b54`). Para cada tela: **para quê**, **quem usa**, **com o que se liga**,
> **o que repete** e **o que ajustar**. No fim: mapa de redundâncias, ligações que faltam e lista de ajustes por prioridade.

---

## 0. A vida de um reparo (o fio que liga as telas)

```
 COMERCIAL                 PLANEJAMENTO              COMPRAS (Logística)              OFICINA                    CLIENTE / FATURAMENTO
 ─────────                 ────────────              ───────────────────              ───────                    ─────────────────────
 Financial Hub             Schedule & Routes         Purchase Orders                  Time clock (QR)            Customer report (aba do projeto)
  spindle recebido  ──►     projeto + equipe  ──►     requisição RC ──► PO SAP ──►     fases em ordem    ──►      Office aprova ──► Portal do cliente
  cotação QUO               materiais do projeto      GR (recebimento)                 fotos ao concluir          Financial Hub: entregue / faturado
       │                          ▲                        ▲     ▲                          │
       ▼                          │                        │     └── Shop floor requests    ▼
 Purchase Orders (venda) ─────────┘   Extensions (SAP) ───┘         (QR, foto)            Workshop hours (supervisão) · TV
  PO do cliente
```

Hoje o fio **não é contínuo**: várias passagens são feitas à mão (status do spindle, status do projeto, PO do cliente,
pedido do shop floor → PO). Os pontos de quebra estão marcados com ⚠️ ao longo do texto.

---

## 1. Telas internas (com login)

### Login
- **Para quê:** escolher o usuário (Logistics / Office; Master escondido em `#/admin`) e digitar o PIN.
- **Liga com:** tela inicial por perfil (Logística → Purchase Orders; Office/Master → Schedule).
- **Ajustar:** ⚠️ sem nuvem, o login só separa perfis no mesmo navegador (não é segurança real).

### Schedule & Routes (Agenda)
- **Para quê:** planejar quem trabalha em qual projeto e quando (Gantt colaborador × dias, semana/quinzena/mês).
- **Quem usa:** Office (edita), todos (consultam).
- **Faz:** criar projeto, arrastar/redimensionar alocações, férias/ausências, conflitos, indicador de materiais na barra,
  botão "TV screen".
- **Ficha do projeto (Drawer, 4 abas)** — é aqui que o projeto é **editado**:
  - *Details:* nº, cliente, endereço, tipo, status, descrição, cor, PO do cliente e spindle (texto livre, travados com "Edit").
  - *Team & dates:* alocações.
  - *Materials:* materiais → requisição; checklist de prontidão; cadeado quando já está com a Logística.
  - *Customer report:* link do portal, avaliações, revisão/aprovação das atualizações.
- **Liga com:** Projects (mesmo projeto, visão de leitura), Purchase Orders (requisições/POs dos materiais),
  Financial (spindle), Workshop hours (horas por fase aparecem nos cards), TV (mesma grade).
- **Repete:** materiais/prontidão também em Projects e em Purchase Orders → Project readiness.
- **Ajustar:**
  - ⚠️ **Status do projeto é manual** (Planned / In progress / Completed): não muda quando a oficina começa ou conclui todas as fases.
  - A grade mostra o **planejado**; o **real** (fase em que o projeto está) só aparece na TV. Falta marcar na barra "fase atual".

### Projects
- **Para quê:** ficha de leitura de cada projeto — cotação, PO do cliente, produção, horas por fase, materiais pendentes,
  linha do tempo. Busca por nº, cliente, PO, RC, spindle, colaborador, PN.
- **Quem usa:** todos (consulta rápida "como está o projeto X?").
- **Liga com:** Schedule (abrir/editar), Financial (spindle), Purchase Orders (requisição), Customer report.
- **Repete:** é uma segunda porta para o mesmo projeto (a edição só existe no Drawer da Agenda).
- **Ajustar:**
  - ⚠️ **Não dá para criar projeto aqui**, nem editar sem "pular" para a Agenda. Quem procura "Projects" no menu espera
    criar/editar ali. Sugestão: botão "New project" e abrir o mesmo Drawer direto nesta tela.
  - Os KPIs (ativos, em produção, aguardando, em risco) misturam planejamento e compras — conferir se são os 4 certos.

### Workshop hours (supervisão da oficina) — *recém-reorganizada*
- **Para quê:** horas reais por projeto e fase, quem trabalhou e quanto; corrigir marcações; exportar.
- **Quem usa:** Office / supervisor (corrigem), demais leem.
- **Abas:** *By project* (padrão) · *Live* (agora + "Forgot to clock out") · *Timesheet* (por pessoa/período) · *Settings*
  (Team & PINs, Phases, QR code).
- **Liga com:** Time clock (origem dos dados), Projects (horas no card), TV, Customer report (cada fase concluída vira
  atualização para revisão), Employees.
- **Repete:**
  - *Settings → Team & PINs* × **Employees**: a mesma pessoa é cadastrada num lugar e recebe o PIN em outro.
  - *Live* × **TV** (rodapé "Agora na oficina"): mesma informação, públicos diferentes (ok).
- **Ajustar:**
  - ⚠️ **PIN do ponto fora da ficha do colaborador** — mover/duplicar o "Definir PIN" para o formulário de Employees.
  - Relatório só para projeto concluído (regra mantida; decidir se quer parcial).

### Purchase Orders (Compras)
- **Para quê:** todo o processo de compras + POs de cliente.
- **Quem usa:** Logística (principal), Office (cria requisições, acompanha), Master.
- **Abas:**
  | Aba | Para quê |
  |---|---|
  | Purchase requisitions | RCs do Office → cotação → "Registrar PO do SAP" → rejeitar |
  | Purchase orders | POs de **compra** (fornecedor) e de **venda** (cliente) |
  | Goods receipts (GR) | registrar recebimentos do SAP (parcial ou total) |
  | Materials & quotations | catálogo por part number, ofertas dos fornecedores, último valor pago |
  | Project readiness | checklist de materiais dos projetos que vão começar |
  | Suppliers | cadastro de fornecedores |
- **Liga com:** Schedule (materiais), Extensions (material sem planta UK01), Financial (PO de venda ↔ spindle),
  Shop floor requests (fornecedores), Projects.
- **Repete:**
  - *Project readiness* × aba *Materials* do projeto × materiais pendentes em *Projects* — três vistas da mesma prontidão.
- **Ajustar:**
  - ⚠️ **PO do cliente (venda) mora em Compras e só a Logística edita** (`po.edit`), mas é dado comercial do Office.
    Além disso o projeto já tem "Customer PO" em texto livre. Hoje existem **dois registros** da mesma coisa.
    Sugestão: PO de cliente vira assunto do Office/Financeiro (no spindle ou no projeto) e sai da lista de compras,
    ou o Office ganha permissão só para POs de venda.
  - Seis abas é muito para quem só cria requisição (Office). Para o Office, mostrar só *Requisitions* e *Readiness*.

### Shop floor requests
- **Para quê:** pedidos feitos pelo QR code no chão de fábrica (foto, item, qtd., fornecedor, código), com *aging*.
- **Quem usa:** Logística (trata), Master.
- **Liga com:** página `#/shop-request` (origem), Suppliers (sugestões).
- **Ajustar:**
  - ⚠️ **"Marcar como pedido" guarda só o nº da PO como texto** — não cria nem liga a uma PO de verdade em Purchase Orders,
    então não entra em GR, último valor pago nem catálogo. Sugestão: botão "Criar requisição/linha de PO" a partir do pedido.
  - ⚠️ **Sem projeto**: o pedido não diz para qual serviço é (consumível geral ou peça de um reparo). Campo opcional "projeto".
  - Fornecedor/código são texto livre: não alimentam o catálogo.

### Extensions (SAP)
- **Para quê:** pedir/registrar a extensão de um material para a planta UK01 (sem isso não há PO no SAP).
- **Quem usa:** qualquer perfil pede; Logística executa.
- **Liga com:** catálogo (plantas), materiais do projeto, requisições e "Registrar PO do SAP" (avisos `PlantBadge`).
- **Repete:** nada relevante — é um processo à parte e está bem isolado.
- **Ajustar:** poderia ser uma aba de Purchase Orders (é parte de compras) em vez de item próprio no menu; manter só se o
  volume justificar.

### Financial Hub
- **Para quê:** spindles/motores (entrada → cotação → aprovado → reparo → teste → entregue), cotações e taxa de aprovação,
  entregas/faturamento do mês, forecast ponderado, gráfico Realizado × Forecast, ranking de clientes.
- **Quem usa:** Office/Master (editam), Logística (lê).
- **Abas:** Overview · Spindles · Quotes · Deliveries · Forecast.
- **Liga com:** Purchase Orders (PO de venda), Projects (cotação aparece na ficha), Schedule (spindle do projeto).
- **Repete:**
  - *Spindles* × *Quotes*: a cotação é um campo do spindle; as duas abas mostram o mesmo registro por ângulos diferentes (ok,
    mas o formulário é um só).
- **Ajustar:**
  - ⚠️ **Status do spindle é manual** (in repair / testing / delivered) enquanto a oficina já sabe a fase real pelo ponto.
    Sugestão: "In repair" quando a 1ª fase começa, "Testing" na fase Testing, "Ready" quando todas concluem — o Office só
    confirma a entrega/fatura.
  - ⚠️ **Cliente é texto em todo lugar** (spindle, projeto, PO, forecast, conta do portal). "PCS" e "PCS Ltd" viram dois
    clientes no ranking e o portal não encontra o projeto. Falta um **cadastro de clientes** único.

### Employees (rodapé)
- **Para quê:** cadastro dos colaboradores (nome, cargo — padrão "Engineer" —, contato, cor), inativar.
- **Liga com:** Schedule (linhas da grade), Workshop hours (ponto), TV.
- **Ajustar:** ⚠️ PIN do ponto (ver Workshop hours). Telefone ainda com máscara brasileira (DDD) — trocar para formato UK.

### Customer accounts (rodapé, Office/Master)
- **Para quê:** login dos **clientes** no portal (usuário + senha de 6 dígitos gerada).
- **Liga com:** Customer report (aba do projeto) e Portal — pelo **nome do cliente**.
- **Ajustar:** depende do cadastro único de clientes (acima) para não falhar por diferença de escrita.

### Data & Backup (rodapé)
- **Para quê:** exportar Excel geral, backup/restore JSON (Master), carregar demo / limpar; usuários internos (Master).
- **Repete:** exportações de horas também em Workshop hours (ok: lá são relatórios, aqui é o "tudo").
- **Ajustar:** sem backup automático.

---

## 2. Telas sem login (abertas por QR code ou link)

| Tela | Rota | Quem | Para quê | Ajustar |
|---|---|---|---|---|
| **Time clock** | `#/clock` | técnicos | nome → PIN → iniciar / pausar / concluir fase (fotos + nota opcionais) | precisa de nuvem para funcionar entre aparelhos |
| **Purchase request** | `#/shop-request` | técnicos | foto → descrição → qtd. → fornecedor → código → PIN | sem campo de projeto; ver Shop floor requests |
| **TV screen** | `#/tv` | oficina | grade da semana + quem está marcando horas agora | — |
| **Customer portal** | `#/portal?p=…` | clientes | relatório aprovado: fases, fotos, horas, PDF | ⚠️ segurança na nuvem (ver CLAUDE.md) |

Duas telas de QR (ponto e pedido de compra) usam o **mesmo PIN do ponto** — bom: o técnico decora um só.
Sugestão: **um único QR "Shop floor"** que abre um menu com "Marcar horas" e "Pedir material", em vez de dois cartazes.

---

## 3. Onde a mesma informação aparece em mais de um lugar

| Informação | Onde aparece | Situação |
|---|---|---|
| Projeto (dados) | Schedule (edita) · Projects (lê) · Workshop hours · TV | ⚠️ Projects deveria editar também |
| Prontidão de materiais | aba Materials do projeto · Purchase Orders → Readiness · card em Projects · KPI da Agenda | ok como vistas, mas o cálculo é um só — manter assim |
| PO do cliente | Purchase Orders (venda) · campo "Customer PO" do projeto · campo PO do spindle | ⚠️ três lugares, dois donos |
| Status do reparo | status do projeto (manual) · status do spindle (manual) · fases do ponto (real) · portal (aprovado) | ⚠️ quatro "verdades" |
| Cliente | texto livre em projeto, spindle, PO, forecast, conta do portal | ⚠️ falta cadastro único |
| Colaborador | Employees · Settings → Team & PINs · Users (internos) | ⚠️ PIN fora da ficha |
| Quem está trabalhando agora | Workshop hours → Live · TV · barra na Agenda (não tem) | ok |
| Exportações | Data & Backup (tudo) · Workshop hours (horas) | ok |

---

## 4. Ligações que faltam (o fio quebrado)

1. **Fases do ponto → status do projeto e do spindle** (automático, com o Office só confirmando).
2. **Pedido do shop floor → requisição/PO de verdade** (e campo de projeto opcional).
3. **Cadastro único de clientes** (projeto, spindle, PO, forecast e portal apontam para o mesmo cliente).
4. **PO do cliente com um dono só** (Office/comercial), ligada ao spindle e ao projeto.
5. **Agenda mostrar o real** (fase atual) sobre o planejado.
6. **Avisos** (quem precisa agir não recebe nada hoje) — ideia nº 2 do CLAUDE.md.
7. **Nuvem** — sem ela, nenhuma das ligações acima funciona entre pessoas/aparelhos.

---

## 5. Ajustes por prioridade

**Rápidos (horas, sem mudar estrutura)**
- [x] "New project" e edição do projeto direto na tela Projects (mesmo Drawer da Agenda).
- [x] "Definir PIN do ponto" também no formulário de Employees.
- [x] Telefone dos colaboradores no formato UK (sem DDD brasileiro).
- [x] Office vê em Purchase Orders só *Requisitions* e *Readiness* (menos abas para quem não é da Logística).
- [x] QR único "Shop floor" com menu Marcar horas / Pedir material.

**Médios (ligam telas)**
- [x] Status do projeto e do spindle sugeridos pelas fases do ponto.
- [x] Shop floor request → "Criar requisição" (com projeto opcional) e PO de verdade.
- [x] Fase atual (real) desenhada na barra da Agenda.

**Estruturais (decisões de negócio)**
- [x] Cadastro único de clientes (e migração dos nomes existentes).
- [x] PO do cliente: um dono (Office) e um lugar (spindle/projeto), saindo de Compras.
- [x] Nuvem + segurança do portal (pré-requisito para uso real).
