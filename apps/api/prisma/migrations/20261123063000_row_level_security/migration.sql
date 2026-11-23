-- ════════════════════════════════════════════════════════════════════════
-- Tenant isolation with PostgreSQL Row-Level Security
--
-- The API sets `app.current_school_id` with set_config(..., is_local => true)
-- at the start of every tenant transaction. The value comes from the
-- authenticated session on the server, never from request input.
-- If the setting is missing, app_current_school_id() is NULL and every
-- policy below matches zero rows (fail closed).
--
-- FORCE ROW LEVEL SECURITY makes the policies apply to the table owner too.
-- Only superusers / BYPASSRLS roles skip them; the runtime role has neither.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app_current_school_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT NULLIF(current_setting('app.current_school_id', true), '')::uuid $$;

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'users', 'roles', 'role_permissions', 'user_roles',
    'academic_years', 'grades', 'sections', 'departments', 'subjects',
    'grade_subjects', 'grading_scales', 'grading_bands', 'exam_categories',
    'staff_profiles', 'teaching_assignments',
    'students', 'enrollments', 'guardians', 'student_guardians'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (school_id = app_current_school_id())
         WITH CHECK (school_id = app_current_school_id())', t);
  END LOOP;
END $$;

-- Audit log: tenant-scoped and append-only for the runtime role.
-- No UPDATE / DELETE policy exists, so those statements affect zero rows.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON audit_logs FOR SELECT USING (school_id = app_current_school_id());
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (school_id = app_current_school_id());

-- Sessions: tenant-scoped for normal access. A session must be resolved from
-- its token hash *before* the tenant is known, so that one lookup goes through
-- a SECURITY DEFINER function owned by the schema owner. RLS is ENABLED but not
-- FORCED here so the owner-defined function can read the row; it returns only
-- the minimum needed to establish the tenant context.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sessions
  USING (school_id = app_current_school_id())
  WITH CHECK (school_id = app_current_school_id());

CREATE OR REPLACE FUNCTION auth_resolve_session(p_token_hash text)
RETURNS TABLE (session_id uuid, user_id uuid, school_id uuid, expires_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.user_id, s.school_id, s.expires_at
  FROM sessions s
  JOIN schools sc ON sc.id = s.school_id
  WHERE s.token_hash = p_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND sc.status = 'ACTIVE'
$$;
REVOKE ALL ON FUNCTION auth_resolve_session(text) FROM PUBLIC;
-- Grant to the runtime role happens through default privileges (see infra/postgres/init).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    GRANT EXECUTE ON FUNCTION auth_resolve_session(text) TO erp_app;
  END IF;
END $$;

-- ───────────────────────── Data integrity rules ─────────────────────────
ALTER TABLE academic_years ADD CONSTRAINT academic_years_dates_chk CHECK (start_date < end_date);
CREATE UNIQUE INDEX academic_years_one_current_per_school
  ON academic_years (school_id) WHERE is_current;

ALTER TABLE grading_bands ADD CONSTRAINT grading_bands_range_chk
  CHECK (min_percent >= 0 AND max_percent <= 100 AND min_percent <= max_percent);
ALTER TABLE grading_scales ADD CONSTRAINT grading_scales_pass_chk
  CHECK (pass_percent >= 0 AND pass_percent <= 100);
ALTER TABLE exam_categories ADD CONSTRAINT exam_categories_weight_chk
  CHECK (weightage >= 0 AND weightage <= 100);
ALTER TABLE users ADD CONSTRAINT users_email_lower_chk CHECK (email = lower(email));
ALTER TABLE platform_admins ADD CONSTRAINT platform_admins_email_lower_chk CHECK (email = lower(email));
ALTER TABLE schools ADD CONSTRAINT schools_code_chk CHECK (code ~ '^[A-Z0-9]{3,16}$');
