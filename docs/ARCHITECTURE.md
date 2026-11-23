# Architecture

## Overview

```
Browser ──► Next.js (apps/web) ──/api/v1/*──► NestJS API (apps/api) ──► PostgreSQL 16 + pgvector
                                                   │   │                      ▲
                                                   │   └──► Redis / BullMQ    │ RLS
                                                   └──signed tenant ctx──► FastAPI AI (services/ai)
```

- The browser only talks to the web origin. Next.js rewrites `/api/v1/*` to the API, so the session cookie is first-party and `httpOnly`.
- The API is a **modular monolith**: `auth`, `access`, `platform`, `school`, `roles`, `academics`, `people`, `audit`, `jobs`, `ai`. Modules use each other only through exported providers, so any of them can later be pulled out into its own service.
- The AI service is a separate Python app. It is never reachable from the browser.

## Tenant isolation (defence in depth)

1. **Tenant from the session.** The session token resolves, through a narrow `SECURITY DEFINER` function, to `(user_id, school_id)`. No endpoint accepts a school id as input. Request bodies are validated with `forbidNonWhitelisted`, so a smuggled `schoolId` is rejected.
2. **Transaction-scoped tenant.** `TenantDb.run()` opens a transaction and runs `set_config('app.current_school_id', <id>, true)`. The setting is local to that transaction, so it cannot leak through a pooled connection.
3. **Row-Level Security.** Every school-owned table has `ENABLE` + `FORCE ROW LEVEL SECURITY`, and a policy `school_id = app_current_school_id()` for both reads and writes. Without a tenant the function returns NULL and nothing matches, so access fails closed.
4. **Restricted runtime role.** The API and AI service connect as `erp_app`: not the owner, and `NOBYPASSRLS`. Migrations run as `erp_owner`.
5. **Composite foreign keys.** Cross-table references use `(id, school_id)`, so a row cannot point at another school's record even through a guessed UUID.
6. **Record-level access (ABAC)** narrows what a user can see *within* their school (next section).

Platform tables (`schools`, `platform_admins`, `platform_sessions`) are not tenant-scoped. Only the platform module, behind a separate Super Admin session, uses them. Platform statistics are computed per school inside that school's own tenant transaction.

## Access control

- **Permissions** are `module:action` strings from a code catalog (`apps/api/src/modules/access/permissions.ts`). Modules from later phases (fees, attendance, exams and others) are already in the catalog, so the role matrix is complete.
- **Roles** belong to a school. Each school starts with these system roles: School Admin, Principal, Academic Coordinator, Accountant, HR Manager, Librarian, Transport Manager, Examination Controller, Teacher, Examination Coordinator, Student and Guardian. Schools can edit them (except School Admin) and add their own. Super Admin is a platform identity, not a school role.
- **Scopes** on each grant:
  - `ALL`: every record in the school.
  - `ASSIGNED`: sections where the teacher is class teacher or subject teacher in the current year, plus sections taught by a department they head.
  - `LINKED`: a guardian's children.
  - `OWN`: the user's own record.
- **Enforcement:** the global `AuthGuard` checks module permissions. Services apply `AccessScopeService` filters on lists and single-record reads, and a record outside scope returns 404. Writes need the `ALL` scope.
- **No escalation:** a role editor can only grant permissions they hold, and only a School Admin can appoint a School Admin. A school always keeps at least one School Admin.

## Sessions and authentication

- Argon2id (m = 19 MiB, t = 2, p = 1).
- A 256-bit random session token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). The database stores only its SHA-256 hash.
- Sessions expire (12 h for schools, 4 h for the platform). They are revoked on logout, on password change (all other sessions) and when a staff member is deactivated. A BullMQ job purges old sessions every hour.
- Lockout after 5 failed attempts for 15 minutes, a per-IP rate limit on login, and the same error message whether the school, the user or the password is wrong.
- Cookie-authenticated writes from an origin outside `CORS_ORIGINS` are refused.

## Configurable academic structure

Nothing in the code assumes a board. The `academics` and `grading` modules store everything as data: years, classes (any naming), sections, departments, subjects, curriculum per class and year, grading scales (percentage bands, GPA or descriptive) with validated non-overlapping bands, and assessment categories with weightage, maximum and passing marks. Provisioning applies an optional board template (CBSE, ICSE, State, or a 7-point scale for IB and Cambridge). Promotion rules, calendars and report-card formats come with the exams phase, using the same pattern.

## AI service contract

The API signs `{schoolId, userId, roles, exp}` with HMAC-SHA256 using the `AI_SERVICE_TOKEN` it shares with the AI service, and sends it as `X-Tenant-Context` together with the service bearer token. The AI service rejects missing, forged, expired or overly long-lived contexts. It runs every query in a transaction bound to that school, under the same RLS. RAG with pgvector embeddings (tenant-scoped tables with the same policies), the study assistant and analytics will be built on this.

## Deployment

`docker-compose.yml` runs Postgres (pgvector), Redis, a one-shot `migrate` job (migrations plus the optional demo seed), the API, the AI service and the web app. On AWS the same images map to:
- ECS/Fargate or EKS for `api`, `ai` and `web`
- RDS PostgreSQL 16 with pgvector
- ElastiCache Redis
- S3 with signed URLs for documents (a later phase)
- Secrets Manager for `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `AI_SERVICE_TOKEN` and the LLM key

## Next phases

1. Student, teacher and parent portals: attendance, homework, study materials, timetable, exams and report cards, announcements.
2. Management modules: fees with Razorpay, HR and leave, library, transport, admissions, events.
3. AI layer: document ingestion into pgvector, the study assistant, teacher insights and management analytics.
4. Documents on S3-compatible storage with signed URLs, notifications (email, SMS, WhatsApp) through BullMQ, and multilingual UI.
