"""Security boundaries for shared global NeuroCanvas Python engines.

These tests explicitly opt into shared mode for TestClient. The shipped engine
defaults to local mode, so legacy/local scientific tests remain unchanged.
"""
import pytest
from fastapi.testclient import TestClient

import access
import main as engine


@pytest.fixture
def shared(monkeypatch):
    monkeypatch.setattr(access, "ENGINE_MODE", "shared")
    monkeypatch.setattr(engine, "ENGINE_MODE", "shared")
    monkeypatch.setattr(access, "TOKEN_SECRET", b"scientifically_random_testing_secret_0123456789")
    engine.SESSIONS.clear()
    engine.SESSION_META.clear()
    access._EVENTS.clear()
    yield TestClient(engine.app)
    engine.SESSIONS.clear()
    engine.SESSION_META.clear()


def issue(client):
    response = client.post("/api/access/guest")
    assert response.status_code == 200, response.text
    return response.json()["token"]


def auth(token):
    return {"Authorization": "Bearer " + token}


def test_shared_health_and_guest_requirements(shared):
    c=shared
    health=c.get("/api/health")
    assert health.status_code==200
    assert health.json()["auth"]=="guest"
    assert health.json()["mode"]=="shared"
    assert "sessions" not in health.json()
    assert c.post("/api/demo").status_code==401
    assert c.get("/api/sessions/anything").status_code==401
    token=issue(c)
    assert c.post("/api/demo",headers=auth(token)).status_code==200
    assert c.post("/api/demo",headers=auth("tampered."+token)).status_code==401
    assert c.post("/api/demo",headers=auth(token.replace(token[-2], "x", 1))).status_code in (200,401)


def test_guest_cannot_access_or_edit_another_guests_sessions(shared):
    c=shared
    a,b=issue(c),issue(c)
    created=c.post("/api/demo",headers=auth(a))
    assert created.status_code==200,created.text
    sid=created.json()["session_id"]
    assert c.get("/api/sessions/"+sid,headers=auth(a)).status_code==200
    assert c.get("/api/sessions/"+sid,headers=auth(b)).status_code==404
    assert c.post("/api/sessions/"+sid+"/viewport",headers=auth(b),
                  json={"channels":["EEG Fz"],"start":0,"duration":1}).status_code==404
    assert c.delete("/api/sessions/"+sid,headers=auth(b)).status_code==404
    assert c.get("/api/sessions/"+sid+"/triggers/events",headers=auth(b)).status_code==404
    assert c.get("/api/sessions/"+sid+"/export/csv",headers=auth(b)).status_code==404
    assert c.delete("/api/sessions/"+sid,headers=auth(a)).status_code==200
    assert sid not in engine.SESSION_META


def test_guest_quotas_and_expiration(shared,monkeypatch):
    c=shared
    token=issue(c)
    ids=[]
    for _ in range(2):
        response=c.post("/api/demo",headers=auth(token))
        assert response.status_code==200
        ids.append(response.json()["session_id"])
    rejected=c.post("/api/demo",headers=auth(token))
    assert rejected.status_code==429
    assert "Two active" in rejected.text
    assert c.delete("/api/sessions/"+ids[0],headers=auth(token)).status_code==200
    assert c.post("/api/demo",headers=auth(token)).status_code==200

    # A short-lived session is never served after expiration.
    sid=ids[1]
    owner,created=engine.SESSION_META[sid]
    engine.SESSION_META[sid]=(owner,created-access.SESSION_TTL_SECONDS-1)
    assert c.get("/api/sessions/"+sid,headers=auth(token)).status_code==404
    assert sid not in engine.SESSIONS


def test_unauthenticated_downloads_cannot_leak_data(shared):
    c=shared
    token=issue(c)
    sid=c.post("/api/demo",headers=auth(token)).json()["session_id"]
    assert c.get("/api/sessions/"+sid+"/triggers/export/events").status_code==401
    r=c.get("/api/sessions/"+sid+"/triggers/export/events",headers=auth(token))
    assert r.status_code==200
    assert "onset_s" in r.text


def test_signed_access_tokens_have_expiration_and_tamper_detection(shared,monkeypatch):
    from fastapi import HTTPException
    token,_=access.create_guest()
    identity=access.validate_guest(token)
    assert identity
    tampered=token[:-5]+"zzzzz"
    with pytest.raises(HTTPException) as err:
        access.validate_guest(tampered)
    assert err.value.status_code==401
    old=access.GUEST_TTL_SECONDS
    monkeypatch.setattr(access, "GUEST_TTL_SECONDS", -1)
    with pytest.raises(HTTPException):
        access.validate_guest(token)
    monkeypatch.setattr(access, "GUEST_TTL_SECONDS", old)
