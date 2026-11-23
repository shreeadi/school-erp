-- Runs once when the Postgres container is first initialised.
-- Two roles are used on purpose:
--   * erp_owner (POSTGRES_USER): owns the schema and runs migrations.
--   * erp_app:  the runtime role used by the API. It does NOT own tables and
--               has NOBYPASSRLS, so PostgreSQL Row-Level Security always applies.
-- In production, give erp_app a strong secret from your secret manager.
\set app_password `echo "${APP_DB_PASSWORD:-erp_app_dev_password}"`

CREATE ROLE erp_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'app_password';
GRANT CONNECT ON DATABASE school_erp TO erp_app;
GRANT USAGE ON SCHEMA public TO erp_app;

-- Every table/sequence/function the owner creates later (via migrations) is
-- automatically usable by the runtime role. RLS policies still restrict rows.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO erp_app;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
