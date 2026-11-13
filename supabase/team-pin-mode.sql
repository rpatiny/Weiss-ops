-- ═══════════════════════════════════════════════════════════════════════════
-- SpindleOps — login por PIN (sem e-mail), modo padrão do app na nuvem.
-- Rode DEPOIS de schema.sql: Supabase → SQL Editor → New query → cole → Run.
--
-- O app acessa os dados com a chave pública (anon) e a escolha de usuário/PIN
-- acontece no próprio app. Isso é adequado para TESTES com dados fictícios:
-- quem tiver o endereço do site e a chave pública consegue ler/gravar a tabela.
-- Para dados reais, use o login por e-mail (VITE_AUTH_MODE=email) e rode
-- `drop policy "records: acesso público (PIN)" on public.records;`.
-- ═══════════════════════════════════════════════════════════════════════════

grant select, insert, update, delete on public.records to anon;

drop policy if exists "records: acesso público (PIN)" on public.records;
create policy "records: acesso público (PIN)" on public.records for all to anon
  using (true) with check (true);
