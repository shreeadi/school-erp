"""Verified tenant context.

The browser never talks to this service. The NestJS API, after authenticating
the user, sends a context it signed with the shared secret:

    X-Tenant-Context: base64url(json payload) + "." + base64url(HMAC-SHA256)

payload = {"schoolId", "userId", "roles", "exp"}

Every database query then runs inside a transaction with
app.current_school_id set to that verified school, so PostgreSQL RLS keeps
AI retrieval inside one school, the same way it does for the API.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings


@dataclass(frozen=True)
class TenantContext:
    school_id: str
    user_id: str
    roles: tuple[str, ...]


def _b64decode(part: str) -> bytes:
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def sign_context(payload: dict, secret: str) -> str:
    """Reference implementation of the signing done by the API (used in tests)."""
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=").decode()
    mac = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{base64.urlsafe_b64encode(mac).rstrip(b'=').decode()}"


def verify_context(header: str, settings: Settings, now: float | None = None) -> TenantContext:
    try:
        body, mac = header.split(".", 1)
        expected = hmac.new(settings.ai_service_token.encode(), body.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64decode(mac)):
            raise ValueError("bad signature")
        payload = json.loads(_b64decode(body))
        now = time.time() if now is None else now
        exp = float(payload["exp"])
        if exp < now or exp > now + settings.context_max_age_seconds:
            raise ValueError("expired")
        school_id = str(uuid.UUID(payload["schoolId"]))
        user_id = str(uuid.UUID(payload["userId"]))
        roles = tuple(str(r) for r in payload.get("roles", []))
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid tenant context") from exc
    return TenantContext(school_id=school_id, user_id=user_id, roles=roles)


def require_service_token(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not token or not hmac.compare_digest(token, settings.ai_service_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Service token required")


def tenant_context(
    _: None = Depends(require_service_token),
    x_tenant_context: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> TenantContext:
    if not x_tenant_context:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tenant context required")
    return verify_context(x_tenant_context, settings)
