"""FastAPI smoke and contract tests on synthetic (non-human) recordings."""
from fastapi.testclient import TestClient
from main import app


def test_session_lifecycle_and_export():
    client = TestClient(app)
    healthy = client.get("/api/health")
    assert healthy.status_code == 200, healthy.text
    demo = client.post("/api/demo")
    assert demo.status_code == 200, demo.text
    meta = demo.json()
    key = meta["session_id"]
    assert meta["samples"] == 10000
    assert meta["sfreq"] == 250
    assert len(meta["channels"]) == 5
    path = f"/api/sessions/{key}"
    view = client.post(f"{path}/viewport", json={"channels": ["EEG Fz"], "duration": 10})
    assert view.status_code == 200, view.text
    raw = view.json()["traces"][0]["y"]

    filt = client.post(f"{path}/pipeline", json={
        "steps": [{"method": "filter", "low": 8, "high": 12, "channels": ["EEG Fz"]}]
    })
    assert filt.status_code == 200, filt.text
    modified = client.post(f"{path}/viewport", json={"channels": ["EEG Fz"], "duration": 10})
    assert modified.status_code == 200
    assert modified.json()["traces"][0]["y"] != raw

    original = client.post(f"{path}/viewport",
                           json={"channels": ["EEG Fz"], "duration": 10, "raw": True})
    assert original.status_code == 200
    assert original.json()["traces"][0]["y"] == raw

    psd = client.get(f"{path}/psd", params={"channel": "EEG Fz"})
    assert psd.status_code == 200
    assert len(psd.json()["frequency"]) == len(psd.json()["psd"])
    assert client.get(f"{path}/quality").status_code == 200
    assert client.get(f"{path}/fft", params={"channel": "EEG Fz", "duration": 8}).status_code == 200
    assert client.get(f"{path}/mne/montage").status_code == 200

    export = client.get(f"{path}/export/csv", params={"processed": False})
    assert export.status_code == 200
    assert export.text.startswith("time_s,EEG Fz")
    assert client.delete(path).status_code == 200
    assert client.get(path).status_code == 404


def test_error_guards_and_events():
    client = TestClient(app)
    key = client.post("/api/demo").json()["session_id"]
    path = f"/api/sessions/{key}"
    # Explicitly selecting zero channels must not silently apply processing to all.
    rejected = client.post(f"{path}/pipeline", json={"steps": [{
        "method": "demean", "channels": []
    }]})
    assert rejected.status_code == 422
    invalid = client.post(f"{path}/pipeline", json={"steps": [{
        "method": "filter", "high": 200, "channels": ["EEG Fz"]
    }]})
    assert invalid.status_code == 422
    missing = client.post(f"{path}/pipeline", json={"steps": [{
        "method": "demean", "channels": ["nonexistent"]
    }]})
    assert missing.status_code == 422
    added = client.post(f"{path}/events", json={"time": 17, "label": "test"})
    assert added.status_code == 200
    assert added.json()["events"] == sorted(added.json()["events"], key=lambda x: x["time"])
    assert client.delete(path).status_code == 200
