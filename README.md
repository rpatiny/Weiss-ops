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
Com o Supabase configurado, todos usam **os mesmos dados**, com atualização em tempo real.

Há dois jeitos de entrar:

| Login | Como funciona | Quando usar |
| --- | --- | --- |
| **PIN** (padrão) | Escolhe o usuário (Master, Logística, Office…) e digita o PIN. Sem e-mail. | Testes com dados fictícios |
| **E-mail** (`VITE_AUTH_MODE=email`) | Cada pessoa cria conta com e-mail/senha; o Master libera o perfil. | Dados reais |

> ⚠️ No login por PIN o banco é acessado com a chave pública: quem tiver o endereço do site consegue
> ler e gravar os dados. Use só com dados fictícios.

1. Crie um projeto gratuito em https://supabase.com (região mais próxima da equipe).
2. **SQL Editor → New query**: cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
   Para o login por **PIN**, rode também [`supabase/team-pin-mode.sql`](supabase/team-pin-mode.sql).
3. **Project Settings → API**: copie a *Project URL* e a chave *anon / publishable*.
4. Na Vercel (**Settings → Environment Variables**) ou num arquivo `.env.local` (veja `.env.example`):
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon
   # opcional: VITE_AUTH_MODE=email
   ```
   e publique de novo (na Vercel: **Deployments → Redeploy**).
5. **Login por PIN:** no primeiro acesso são criados Master `1234`, Logística `2222` e Office `3333`
   (troque os PINs em **Dados & Backup → Usuários**). O Master usa "Carregar demonstração" ou "Restaurar backup".
6. **Login por e-mail:** em **Authentication → URL Configuration** coloque o endereço do app em *Site URL*
   (opcional: desative "Confirm email"). Quem criar a primeira conta vira **Master**; os demais clicam em
   "Criar conta" e aguardam o Master definir o perfil em **Dados & Backup → Usuários**.

## Publicar na Vercel

1. Em https://vercel.com, entre com o GitHub e use **Add New… → Project** neste repositório.
2. A Vercel detecta o Vite: Build Command `npm run build`, Output Directory `dist`.
3. **Deploy**. Cada novo push no `main` publica automaticamente.

> Os dados ficam no navegador de cada usuário (localStorage). Para várias pessoas trabalharem
> com os mesmos dados em computadores diferentes é preciso um banco compartilhado (ex.: Supabase);
> a camada `src/data/` foi feita para essa troca.

Arquitetura, modelos, regras de negócio e convenções: veja `CLAUDE.md`.
