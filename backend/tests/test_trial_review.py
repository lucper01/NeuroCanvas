"""Regression coverage for reversible trial review and condition metrics."""
from __future__ import annotations

import csv
from io import StringIO
import numpy as np
import pytest
from fastapi.testclient import TestClient

from engine import Recording
from triggers import condition_epochs, epoch_rows, multichannel_epochs_npz
from review import event_uid, set_decision, decisions_export, condition_metrics
from main import app


def sample_recording():
    fs = 250
    time = np.arange(10 * fs) / fs
    values = np.sin(2 * np.pi * 5 * time)
    events = [{"time": float(t), "label": str(code), "code": code, "source": "stim"}
              for t, code in [(2, 11), (4, 12), (6, 21), (8, 11)]]
    recording = Recording("review-fixture", np.vstack([values, values * 0.6]), fs,
                          ["EEG Fz", "ECG"], ["eeg", "ecg"], ["V", "mV"],
                          "synthetic", events=events)
    recording.trigger_definitions = [
        {"code": 11, "meaning": "Visual standard", "conditions": ["Visual", "Standard"]},
        {"code": 12, "meaning": "Visual deviant", "conditions": ["Visual"]},
        {"code": 21, "meaning": "Auditory", "conditions": ["Auditory"]},
    ]
    return recording


def test_uid_and_manual_review_are_stable_and_reversible():
    rec = sample_recording()
    uid = event_uid(rec, rec.events[0])
    assert uid == event_uid(rec, dict(rec.events[0]))
    raw = rec.original.copy()
    with pytest.raises(ValueError, match="reason"):
        set_decision(rec, uid, True, "")
    with pytest.raises(ValueError, match="Unknown"):
        set_decision(rec, "wrong", True, "motion")
    set_decision(rec, uid, True, "movement")
    log = decisions_export(rec)
    assert log["reviewed"][0]["event_uid"] == uid
    assert log["reviewed"][0]["code"] == 11
    default = condition_epochs(rec, "EEG Fz", "Visual", -.2, .8)
    assert default["n"] == 3
    assert default["trials"][0]["review_rejected"] is True
    assert default["trials"][0]["review_reason"] == "movement"
    curated = condition_epochs(rec, "EEG Fz", "Visual", -.2, .8,
                               exclude_rejected=True)
    assert curated["n"] == 2
    assert curated["excluded_rejected"] == 1
    assert all(trial["event_uid"] != uid for trial in curated["trials"])
    assert np.array_equal(raw, rec.original)
    set_decision(rec, uid, False)
    assert rec.trial_decisions == []
    assert condition_epochs(rec, "EEG Fz", "Visual", -.2, .8,
                            exclude_rejected=True)["n"] == 3


def test_csv_and_npz_contain_rejection_provenance():
    import json
    rec = sample_recording()
    uid = event_uid(rec, rec.events[0])
    set_decision(rec, uid, True, "blink")
    rows = list(epoch_rows(rec, "EEG Fz", "Visual", -.2, .8, 0, False,
                           exclude_rejected=False))
    assert len(rows) == 3 * 251
    assert rows[0][-3] == uid
    assert rows[0][-2] is True
    curated = list(epoch_rows(rec, "EEG Fz", "Visual", -.2, .8, 0,
                              False, exclude_rejected=True))
    assert len(curated) == 2 * 251
    with np.load(multichannel_epochs_npz(rec, "Visual", -.2, .8,
                                          exclude_rejected=True),
                 allow_pickle=False) as data:
        metadata = json.loads(data["metadata_json"].item())
        assert data["epochs"].shape == (2, 2, 251)
        assert metadata["excluded_rejected"] == 1
        assert metadata["exclude_rejected"] is True
        assert metadata["trial_decisions"][0]["reason"] == "blink"


def test_measurement_window_statistics_and_error_cases():
    rec = sample_recording()
    report = condition_metrics(rec, "EEG Fz", -.2, .8, 0, .3)
    assert {row["condition"] for row in report["conditions"]} == {
        "Visual", "Standard", "Auditory"
    }
    assert next(x for x in report["conditions"] if x["condition"] == "Visual")["n"] == 3
    for row in report["conditions"]:
        assert row["status"] == "ok"
        assert np.isfinite(row["mean_amplitude"])
        assert 0 <= row["peak_latency_s"] <= .3
        assert np.isfinite(row["auc"])
    with pytest.raises(ValueError, match="Measurement window"):
        condition_metrics(rec, "EEG Fz", -.2, .8, .1, 1.2)


def test_http_trial_review_and_metrics_csv():
    client = TestClient(app)
    key = client.post("/api/demo").json()["session_id"]
    root = f"/api/sessions/{key}"
    response = client.post(root + "/triggers/detect",
                           json={"channel": "TRIGGER TTL", "commit": True})
    assert response.status_code == 200
    result = client.get(root + "/triggers/epochs", params={
        "channel": "EEG Fz", "condition": "Visual"
    })
    assert result.status_code == 200
    assert result.json()["n"] == 4
    uid = result.json()["trials"][0]["event_uid"]
    denied = client.post(root + "/trials/review", json={
        "event_uid": uid, "rejected": True, "reason": ""
    })
    assert denied.status_code == 422
    marked = client.post(root + "/trials/review", json={
        "event_uid": uid, "rejected": True, "reason": "motion"
    })
    assert marked.status_code == 200, marked.text
    assert len(marked.json()["metadata"]["trial_decisions"]) == 1
    checked = client.get(root + "/triggers/epochs", params={
        "channel": "EEG Fz", "condition": "Visual", "exclude_rejected": True
    })
    assert checked.status_code == 200
    assert checked.json()["n"] == 3
    metrics = client.get(root + "/triggers/metrics", params={
        "channel": "EEG Fz", "measure_start": 0, "measure_end": .2,
        "exclude_rejected": True
    })
    assert metrics.status_code == 200, metrics.text
    assert any(row["n"] == 3 for row in metrics.json()["conditions"])
    csv_response = client.get(root + "/triggers/export/metrics", params={
        "channel": "EEG Fz", "exclude_rejected": True
    })
    assert csv_response.status_code == 200
    rows = list(csv.DictReader(StringIO(csv_response.text)))
    assert rows
    assert "signed_auc" in rows[0]
    trials = client.get(root + "/trials/review").json()
    assert trials["reviewed"][0]["reason"] == "motion"
    client.post(root + "/trials/review", json={
        "event_uid": uid, "rejected": False
    })
    assert client.get(root + "/trials/review").json()["reviewed"] == []
    client.delete(root)
