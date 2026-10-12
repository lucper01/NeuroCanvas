"""Universal NeuroCanvas engine access: local or isolated anonymous sessions.

This module contains only signed guest identity and conservative in-process
throttling. Run one Uvicorn worker per container and use edge rate limits,
authentication, resource limits and monitoring for public production hosting.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from collections import defaultdict, deque
from contextvars import ContextVar

from fastapi import HTTPException

ENGINE_MODE = os.getenv("NEUROCANVAS_ENGINE_MODE", "local").strip().lower()
if ENGINE_MODE not in {"local", "shared"}:
    raise RuntimeError("NEUROCANVAS_ENGINE_MODE must be local or shared.")
TOKEN_SECRET = os.getenv("NEUROCANVAS_TOKEN_SECRET", "").encode("utf-8")
if ENGINE_MODE == "shared" and len(TOKEN_SECRET) < 32:
    raise RuntimeError("Shared mode requires NEUROCANVAS_TOKEN_SECRET (32+ random characters).")

GUEST_TTL_SECONDS = 2 * 60 * 60
SESSION_TTL_SECONDS = 2 * 60 * 60
MAX_SESSIONS_PER_GUEST = 2
MAX_SHARED_UPLOAD_BYTES = 30 * 1024 * 1024
MAX_SHARED_SESSIONS = 12
MAX_CALLS_PER_MINUTE = 120
MAX_GUEST_CREATES_PER_HOUR = 24
OWNER: ContextVar[str | None] = ContextVar("nc_guest", default=None)

# The runtime is deliberately single-worker; an external reverse proxy must
# enforce independent per-IP quotas to resist distributed high-volume traffic.
_EVENTS: dict[str, deque[float]] = defaultdict(deque)


def _trim(bucket: deque[float], seconds: float):
    now = time.time()
    while bucket and now - bucket[0] > seconds:
        bucket.popleft()


def throttle(key: str, limit: int, window_seconds: int):
    bucket = _EVENTS[key]
    _trim(bucket, window_seconds)
    if len(bucket) >= limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Retry later.")
    bucket.append(time.time())
    if len(_EVENTS) > 8000:
        for name in list(_EVENTS)[:4000]:
            if not _EVENTS[name]:
                del _EVENTS[name]


def _signature(payload: str) -> str:
    mac = hmac.new(TOKEN_SECRET, payload.encode("ascii"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode("ascii").rstrip("=")


def create_guest() -> tuple[str, str]:
    if ENGINE_MODE != "shared":
        raise HTTPException(404, "Guest access not enabled.")
    guest_id = secrets.token_urlsafe(18)
    issued = str(int(time.time()))
    body = guest_id + "." + issued
    return body + "." + _signature(body), guest_id


def validate_guest(token: str) -> str:
    if len(token) > 320:
        raise HTTPException(401, "Invalid guest authorization.")
    pieces = token.split(".")
    if len(pieces) != 3 or not pieces[0] or not pieces[1].isdigit():
        raise HTTPException(401, "Invalid guest authorization.")
    guest_id, issued, claimed = pieces
    body = guest_id + "." + issued
    if not hmac.compare_digest(_signature(body), claimed):
        raise HTTPException(401, "Invalid guest authorization.")
    now = int(time.time())
    if not 0 <= now - int(issued) <= GUEST_TTL_SECONDS:
        raise HTTPException(401, "Guest session expired. Reconnect the Python engine.")
    return guest_id


def session_owner() -> str:
    owner = OWNER.get()
    if ENGINE_MODE == "shared" and not owner:
        raise HTTPException(401, "Guest authorization required.")
    return owner or "local"
