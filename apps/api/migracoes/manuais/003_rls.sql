-- Isolamento por organização. Fora desta lista (globais, sem RLS): usuarios, sessoes,
-- chaves_de_api, eventos_de_saida e eventos_processados (ADR 10).

-- organizacoes: o identificador é o próprio id
ALTER TABLE organizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizacoes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_por_organizacao ON organizacoes;
CREATE POLICY isolamento_por_organizacao ON organizacoes
  USING (id = app_organizacao_id())
  WITH CHECK (id = app_organizacao_id());

-- demais tabelas de negócio
DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'membros',
    'webhooks',
    'entregas_de_webhook',
    'sistemas',
    'avaliacoes',
    'etapas_da_avaliacao',
    'requisicoes_do_guardiao',
    'achados',
    'ocorrencias_do_achado',
    'historico_do_achado',
    'relatorios',
    'registros_de_auditoria'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('DROP POLICY IF EXISTS isolamento_por_organizacao ON %I', tabela);
    EXECUTE format(
      'CREATE POLICY isolamento_por_organizacao ON %I USING (organizacao_id = app_organizacao_id()) WITH CHECK (organizacao_id = app_organizacao_id())',
      tabela
    );
  END LOOP;
END
$$;

-- membros: o login precisa achar os vínculos do usuário antes de existir organização no contexto
DROP POLICY IF EXISTS vinculos_do_usuario ON membros;
CREATE POLICY vinculos_do_usuario ON membros FOR SELECT
  USING (usuario_id = app_usuario_id());
