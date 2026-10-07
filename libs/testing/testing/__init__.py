"""
Test helpers for database transaction tests: a SQLite double, and a real-Postgres
wrapper with the same assertion surface so one suite runs against both.
"""

from .pg_double import PgDouble, sqlite_supports_upsert_returning
from .pg_real import BACKENDS, PgReal, open_db

__all__ = ["BACKENDS", "PgDouble", "PgReal", "open_db", "sqlite_supports_upsert_returning"]
