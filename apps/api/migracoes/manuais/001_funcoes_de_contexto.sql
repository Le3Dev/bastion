-- Funções que leem o contexto da transação (definido com set_config('app.organizacao_id', ..., true)).
CREATE OR REPLACE FUNCTION app_organizacao_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.organizacao_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_usuario_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.usuario_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION app_organizacao_id() TO bastion_app;
GRANT EXECUTE ON FUNCTION app_usuario_id() TO bastion_app;
