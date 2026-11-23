"""School ERP AI service.

Independent FastAPI application. In this foundation phase it provides the
security envelope (service authentication, verified tenant context, RLS-bound
database access). RAG over school documents with pgvector, the study
assistant and analytics arrive in the AI phase on top of these primitives.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from . import db
from .config import get_settings
from .tenant import TenantContext, tenant_context


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    db.close_pool()


app = FastAPI(title="School ERP AI Service", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "llmProvider": get_settings().llm_provider, "llmConfigured": bool(get_settings().llm_api_key)}


@app.get("/v1/context")
def context(ctx: TenantContext = Depends(tenant_context)) -> dict:
    """Confirms the verified tenant and that database reads are confined to it."""
    with db.tenant_transaction(ctx.school_id) as conn:
        row = conn.execute(
            "SELECT count(*) AS students, count(DISTINCT school_id) AS schools FROM students"
        ).fetchone()
    return {
        "schoolId": ctx.school_id,
        "userId": ctx.user_id,
        "roles": list(ctx.roles),
        "visibleStudents": row[0],
        "visibleSchools": row[1],
    }
