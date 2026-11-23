import os
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.tenant import sign_context

client = TestClient(app)
SECRET = get_settings().ai_service_token


def ctx(school_id: str, exp_in: float = 30, secret: str = SECRET) -> str:
    return sign_context({"schoolId": school_id, "userId": str(uuid.uuid4()), "roles": ["TEACHER"], "exp": time.time() + exp_in}, secret)


def auth(token: str = SECRET) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_health_is_public():
    assert client.get("/health").status_code == 200


def test_requires_service_token():
    assert client.get("/v1/context", headers={"X-Tenant-Context": ctx(str(uuid.uuid4()))}).status_code == 401
    assert client.get("/v1/context", headers={**auth("wrong"), "X-Tenant-Context": ctx(str(uuid.uuid4()))}).status_code == 401


def test_rejects_forged_or_expired_context():
    sid = str(uuid.uuid4())
    assert client.get("/v1/context", headers=auth()).status_code == 401
    assert client.get("/v1/context", headers={**auth(), "X-Tenant-Context": ctx(sid, secret="forged-secret")}).status_code == 401
    assert client.get("/v1/context", headers={**auth(), "X-Tenant-Context": ctx(sid, exp_in=-5)}).status_code == 401
    assert client.get("/v1/context", headers={**auth(), "X-Tenant-Context": ctx(sid, exp_in=3600)}).status_code == 401
    tampered = ctx(sid)
    body, mac = tampered.split(".")
    assert client.get("/v1/context", headers={**auth(), "X-Tenant-Context": body[:-2] + "AA." + mac}).status_code == 401


@pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="needs the seeded database")
def test_database_reads_are_confined_to_the_tenant():
    import psycopg

    owner_url = os.environ.get("MIGRATION_DATABASE_URL")
    with psycopg.connect(owner_url) as conn:
        rows = conn.execute(
            "SELECT s.id, (SELECT count(*) FROM students st WHERE st.school_id = s.id) FROM schools s WHERE code IN ('GREENWOOD','STMARYS')"
        ).fetchall()
    expected = {str(r[0]): r[1] for r in rows}
    for sid in expected:
        r = client.get("/v1/context", headers={**auth(), "X-Tenant-Context": ctx(sid)})
        assert r.status_code == 200
        body = r.json()
        assert body["schoolId"] == sid
        assert body["visibleSchools"] == 1
        assert body["visibleStudents"] == expected[sid]


def teardown_module():
    from app import db

    db.close_pool()
