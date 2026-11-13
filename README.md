# SpindleOps

Gestão operacional e financeira para empresas de reparo de spindles e motores industriais:
cronograma de projetos por colaborador (com férias e dias úteis), ordens de compra, processo de compras
(requisição → PO do SAP → GR), extensões de material no SAP, catálogo com cotações, prontidão dos projetos,
hub financeiro (cotações, entregas, forecast, ranking) e exportação Excel / backup JSON. Interface em
português, inglês e alemão, com tema claro e escuro.

## Rodar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Abra http://localhost:5173. PINs de demonstração: **Master 1234 · Logística 2222 · Office 3333**.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Verificação de tipos + build de produção em `dist/` |
| `npm run preview` | Serve o build de produção |
| `npm run build:artifact` | Versão de arquivo único em `dist-artifact/spindleops.html` |

## Publicar na Vercel

1. Em https://vercel.com, entre com o GitHub e use **Add New… → Project** neste repositório.
2. A Vercel detecta o Vite: Build Command `npm run build`, Output Directory `dist`.
3. **Deploy**. Cada novo push no `main` publica automaticamente.

> Os dados ficam no navegador de cada usuário (localStorage). Para várias pessoas trabalharem
> com os mesmos dados em computadores diferentes é preciso um banco compartilhado (ex.: Supabase);
> a camada `src/data/` foi feita para essa troca.

Arquitetura, modelos, regras de negócio e convenções: veja `CLAUDE.md`.
