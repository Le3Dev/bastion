-- Auditoria é somente inclusão: sem UPDATE/DELETE para a aplicação e bloqueada por gatilho para todos.
REVOKE UPDATE, DELETE ON registros_de_auditoria FROM bastion_app;

CREATE OR REPLACE FUNCTION impedir_alteracao_de_auditoria() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria são somente inclusão';
END
$$;

DROP TRIGGER IF EXISTS auditoria_somente_inclusao ON registros_de_auditoria;
CREATE TRIGGER auditoria_somente_inclusao
  BEFORE UPDATE OR DELETE ON registros_de_auditoria
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_de_auditoria();
