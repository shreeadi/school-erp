-- Removes sessions that expired or were revoked more than 7 days ago, across
-- all schools. Runs as the schema owner (SECURITY DEFINER) because a
-- background job has no tenant; it only deletes, never returns tenant data.
CREATE OR REPLACE FUNCTION auth_purge_expired_sessions() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE n integer; m integer;
BEGIN
  DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM platform_sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days';
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END $$;
REVOKE ALL ON FUNCTION auth_purge_expired_sessions() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT EXECUTE ON FUNCTION auth_purge_expired_sessions() TO erp_app;
  END IF;
END $$;
