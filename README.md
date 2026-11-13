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

## Modo nuvem (Supabase): dados compartilhados pela equipe

Sem configuração, o app roda no **modo local** (dados no navegador, com demonstração e login por PIN).
Com o Supabase configurado, todos usam **os mesmos dados**, com login por e-mail e senha e atualização em tempo real.

1. Crie um projeto gratuito em https://supabase.com (região mais próxima da equipe).
2. **SQL Editor → New query**: cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. **Authentication → URL Configuration**: em *Site URL*, coloque o endereço do app (ex.: `https://weiss-ops.vercel.app`).
   *Opcional:* em **Authentication → Providers → Email**, desative "Confirm email" para não exigir confirmação por e-mail.
4. **Project Settings → API**: copie a *Project URL* e a chave *anon / publishable* (é pública por design;
   a segurança vem das regras RLS do passo 2).
5. Na Vercel (**Settings → Environment Variables**) ou num arquivo `.env.local` (veja `.env.example`):
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon
   ```
   e publique de novo (na Vercel: **Deployments → Redeploy**).
6. **Primeiro acesso:** quem criar a primeira conta vira **Master**. A base começa vazia: o Master usa
   "Restaurar backup" (JSON exportado do modo local) ou "Carregar demonstração".
7. **Equipe:** cada pessoa clica em "Criar conta" na tela de login e fica *aguardando liberação*;
   o Master define o perfil em **Dados & Backup → Usuários** (Logística ou Office).

## Publicar na Vercel

1. Em https://vercel.com, entre com o GitHub e use **Add New… → Project** neste repositório.
2. A Vercel detecta o Vite: Build Command `npm run build`, Output Directory `dist`.
3. **Deploy**. Cada novo push no `main` publica automaticamente.

> Os dados ficam no navegador de cada usuário (localStorage). Para várias pessoas trabalharem
> com os mesmos dados em computadores diferentes é preciso um banco compartilhado (ex.: Supabase);
> a camada `src/data/` foi feita para essa troca.

Arquitetura, modelos, regras de negócio e convenções: veja `CLAUDE.md`.
