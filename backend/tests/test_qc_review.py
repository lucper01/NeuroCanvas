"""Review decisions must be reversible, documented and opt-in."""
import numpy as np
import pytest

from engine import Recording, evoked
from advanced import windowed_quality
from fastapi.testclient import TestClient
from main import app


def fixture():
    fs = 250
    time = np.arange(2500) / fs
    values = np.sin(2 * np.pi * 10 * time)
    return Recording(
        "fixture", np.vstack([values, values * .5]), fs,
        ["EEG Fz", "EEG Cz"], ["eeg", "eeg"], ["V", "V"], "test",
        events=[{"time": float(t), "label": "A", "duration": 0}
                for t in [1, 3, 5, 7, 9]],
    )


def test_screening_flags_and_does_not_mutate_recording():
    rec = fixture()
    original = rec.original.copy()
    rec.processed[0, 500:525] += 100
    result = windowed_quality(rec, window_seconds=1, channel="EEG Fz")
    windows = result["channel_results"][0]["windows"]
    assert len(windows) == 10
    assert windows[2]["relative_high_amplitude"]
    assert np.array_equal(rec.original, original)
    assert rec.bad_segments == []


def test_opt_in_exclusion_of_epochs():
    rec = fixture()
    all_epochs = evoked(rec, "EEG Fz", "A", tmin=-.2, tmax=.8)
    rec.bad_segments.append({"start": 3, "end": 3.2, "reason": "movement"})
    all_unchanged = evoked(rec, "EEG Fz", "A", tmin=-.2, tmax=.8)
    curated = evoked(rec, "EEG Fz", "A", tmin=-.2, tmax=.8, exclude_marked=True)
    assert all_unchanged["n"] == all_epochs["n"]
    assert curated["n"] == all_epochs["n"] - 1
    assert curated["excluded"] == all_epochs["excluded"] + 1


def test_manual_marks_are_validated_persisted_and_reversible():
    client = TestClient(app)
    key = client.post("/api/demo").json()["session_id"]
    route = f"/api/sessions/{key}"
    assert client.post(route + "/qc/segments", json={
        "start": 2, "end": 1, "reason": "motion",
    }).status_code == 422
    assert client.post(route + "/qc/segments", json={
        "start": 2, "end": 4, "reason": "motion",
    }).status_code == 200
    assert client.post(route + "/qc/channels", json={
        "name": "EEG Fz", "marked": True,
    }).status_code == 200
    info = client.get(route).json()
    assert info["bad_segments"][0]["reason"] == "motion"
    assert "EEG Fz" in info["bad_channels"]
    summary = client.get(route + "/qc/windows", params={"channel": "EEG Fz"})
    assert summary.status_code == 200
    assert any(row["manually_excluded"] for row in summary.json()["channel_results"][0]["windows"])
    manifest = client.get(route + "/qc/export").json()
    assert manifest["bad_channels"] == ["EEG Fz"]
    assert client.delete(route + "/qc/segments/0").status_code == 200
    assert client.post(route + "/qc/channels", json={
        "name": "EEG Fz", "marked": False,
    }).status_code == 200
    assert client.get(route).json()["bad_segments"] == []
    assert client.get(route).json()["bad_channels"] == []
    client.delete(route)


def test_mne_epoch_rejection_matches_manual_marks():
    pytest.importorskip("mne")
    from advanced import mne_epochs
    rec = fixture()
    baseline = mne_epochs(rec, "A")
    rec.bad_segments = [{"start": 3., "end": 3.1, "reason": "movement"}]
    marked = mne_epochs(rec, "A", exclude_marked=True)
    assert marked["n"] == baseline["n"] - 1
    assert marked["manual_rejected"] == 1
