-- Executado pelo psql só na criação do volume. Senhas de DESENVOLVIMENTO.

CREATE ROLE bastion_migrador LOGIN PASSWORD 'migrador_dev' NOSUPERUSER;
CREATE ROLE bastion_app LOGIN PASSWORD 'app_dev' NOSUPERUSER NOBYPASSRLS;

CREATE DATABASE bastion OWNER bastion_migrador;
CREATE DATABASE bastion_teste OWNER bastion_migrador;

\connect bastion
ALTER SCHEMA public OWNER TO bastion_migrador;
GRANT USAGE ON SCHEMA public TO bastion_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bastion_migrador IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bastion_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bastion_migrador IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bastion_app;

\connect bastion_teste
ALTER SCHEMA public OWNER TO bastion_migrador;
GRANT USAGE ON SCHEMA public TO bastion_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bastion_migrador IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bastion_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bastion_migrador IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bastion_app;
