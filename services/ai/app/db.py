"""Tenant-scoped database access (RLS enforced by PostgreSQL)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg_pool import ConnectionPool

from .config import get_settings

_pool: ConnectionPool | None = None


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(get_settings().database_url, min_size=1, max_size=10, open=True)
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def tenant_transaction(school_id: str) -> Iterator[psycopg.Connection]:
    """A transaction bound to one school. The setting is transaction-local."""
    with pool().connection() as conn:
        with conn.transaction():
            conn.execute("SELECT set_config('app.current_school_id', %s, true)", (school_id,))
            yield conn
