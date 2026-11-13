-- Agendamentos recorrentes de avaliação: permissões e isolamento por organização.
-- Executar após a migração gerada que cria a tabela agendamentos. Idempotente.

GRANT SELECT, INSERT, UPDATE, DELETE ON agendamentos TO bastion_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bastion_app;

ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_por_organizacao ON agendamentos;
CREATE POLICY isolamento_por_organizacao ON agendamentos
  USING (organizacao_id = app_organizacao_id())
  WITH CHECK (organizacao_id = app_organizacao_id());
