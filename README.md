# School ERP

A multi-tenant, AI-ready school management platform for schools of any board (CBSE, ICSE, State Boards, IB, Cambridge or a custom structure). One deployment serves many schools; each school's data is isolated in the database itself.

This repository holds the **foundation phase**: tenancy, security, the configurable academic structure and core people records. The student, teacher and parent portals, fees (Razorpay), and the AI features are built on top of it in later phases.

## What's in the foundation

| Area | What works today |
|---|---|
| **Multi-tenancy** | Shared PostgreSQL with `school_id` on every school-owned row and **Row-Level Security** on every tenant table. The API connects as a role that cannot bypass RLS. The school is derived from the session, never from the request. |
| **Platform vs school** | Super Admins live in their own table, sessions and cookie. They provision, list, suspend and reactivate schools. |
| **Authentication** | Argon2id passwords, opaque server-side sessions (only a SHA-256 hash is stored), httpOnly cookies, account lockout, login rate limiting, origin checks on cookie writes, session revocation on logout and password change. |
| **RBAC + ABAC** | A permission catalog (`module:action`), 11 system roles per school (the 8 school-level admin roles from the brief, plus Teacher, Exam Coordinator, Student and Guardian) and custom roles. Each permission carries a record scope: `ALL`, `ASSIGNED` (teacher's real class / subject / department assignments), `LINKED` (a parent's children) or `OWN`. |
| **Academic structure** | Academic years, classes, sections, departments, subjects, curriculum per class and year, grading scales with bands, and assessment categories with weightage. Board templates seed a starting point, and every value is editable per school. |
| **People** | Staff (with portal accounts and teaching assignments), students (admission with auto admission numbers, enrollment per year, status changes), guardians (several children per guardian, several guardians per child). |
| **Audit** | An append-only audit log, written in the same transaction as each change. |
| **Background jobs** | BullMQ on Redis. An hourly job purges expired sessions. |
| **AI service** | A separate FastAPI app. The API sends it an HMAC-signed tenant context, and every database read runs under the same RLS. |
| **Web app** | Next.js, Tailwind and shadcn-style components. It has sign-in, a role-aware overview built from live data, students (search, filters, admission, detail), staff, academic setup, the role matrix and the Super Admin console. |

## Quick start (Docker)

```bash
cp .env.example .env          # change the secrets before any shared deployment
docker compose up --build
```

- Web app: http://localhost:3000
- API docs (Swagger): http://localhost:4000/api/docs
- Super Admin console: http://localhost:3000/platform/login

On first start the `migrate` job applies migrations and loads **synthetic** demo data. All names, phone numbers and addresses are generated.

### Demo accounts (password `Demo@12345`)

| School code | Board | Accounts |
|---|---|---|
| `GREENWOOD` | CBSE, Bengaluru | `admin@`, `principal@`, `academic@`, `accounts@`, `hr@`, `library@`, `transport@`, `exams@`, `teacher@`, `hod@`, `student@`, `parent@` **greenwood.demo** |
| `STMARYS` | ICSE, Pune | same names at **stmarys.demo** |
| `SUNRISE` | Tamil Nadu State Board, Chennai | same names at **sunrise.demo** |

The Super Admin is `superadmin@school-erp.demo`. The `parent@` account has two children, and `teacher@` and `hod@` show assignment-based access.

## Local development

Requirements: Node 22, pnpm 10, Python 3.12+, PostgreSQL 16 with pgvector, and Redis.

```bash
pnpm install
# 1. Create the database and the two roles (owner + restricted runtime role)
createdb school_erp
psql -d school_erp -f infra/postgres/init/01-roles.sql
# 2. API
cp apps/api/.env.example apps/api/.env
pnpm --filter @school-erp/api db:migrate
pnpm --filter @school-erp/api build
pnpm --filter @school-erp/api db:seed
pnpm dev:api                    # http://localhost:4000
# 3. Web
pnpm dev:web                    # http://localhost:3000 (proxies /api to the API)
# 4. AI service
cd services/ai && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

### Tests

```bash
pnpm --filter @school-erp/api test      # needs the seeded database
cd services/ai && .venv/bin/pytest -q
```

The API suite checks the guarantees that matter most:
- RLS returns nothing without a tenant and blocks writes into another school.
- No cross-school reads or writes by id, and a `schoolId` in a request body is rejected.
- Teachers see only their assigned sections, students see only themselves, and parents see only their children.
- Role edits cannot grant more than the editor holds.
- Platform and school sessions are separate.
- Lockout, logout and revocation, and the CSRF origin check.

## Repository layout

```
apps/api        NestJS modular monolith (REST + Swagger), Prisma, migrations, seed, tests
apps/web        Next.js web app
services/ai     FastAPI AI service (independent, tenant-scoped)
infra/postgres  Database role bootstrap
docs/           Architecture and security notes
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.
