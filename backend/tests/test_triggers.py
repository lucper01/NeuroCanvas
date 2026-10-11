"""Trigger edge detection, grouping, event metadata and epoch exports."""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from engine import Recording
from main import app
from triggers import (
    detect_triggers, validate_definitions, commit_detected,
    condition_epochs, epoch_rows, map_trigger,
)


def build():
    fs, n = 250., 2500
    time = np.arange(n)/fs
    status = np.zeros(n)
    status[250:253] = 11
    status[500:504] = 12
    status[750:753] = 21
    status[1000:1004] = 22
    status[1250:1253] = 11
    return Recording(
        "Synthetic event detection", np.stack([np.sin(2*np.pi*10*time),status]),fs,
        ["Cz","Status"],["eeg","stim"],["V","code"],"synthetic")


def test_exact_edges_counts_and_grouped_conditions():
    rec=build()
    preview=detect_triggers(rec,"Status")
    assert len(preview["events"])==5
    assert preview["counts"]=={"11":2,"12":1,"21":1,"22":1}
    assert [e["time"] for e in preview["events"]]==[1.,2.,3.,4.,5.]
    assert rec.events==[]  # Detection is preview only.
    rec.trigger_definitions=validate_definitions([
        {"code":11,"meaning":"Visual standard","conditions":["Visual","Standards"]},
        {"code":12,"meaning":"Visual deviant","conditions":["Visual"]},
        {"code":21,"meaning":"Auditory standard","conditions":["Auditory","Standards"]},
        {"code":22,"meaning":"Auditory deviant","conditions":["Auditory"]},
    ])
    result=commit_detected(rec,preview)
    assert result["committed"]==5
    assert rec.events[0]["code"]==11
    visual=condition_epochs(rec,"Cz","Visual",-.1,.3)
    auditory=condition_epochs(rec,"Cz","Auditory",-.1,.3)
    standards=condition_epochs(rec,"Cz","Standards",-.1,.3)
    assert visual["n"]==3
    assert auditory["n"]==2
    assert standards["n"]==3
    assert visual["codes"]=={"11":2,"12":1}
    assert len(visual["trials"])==3
    rows=list(epoch_rows(rec,"Cz","Visual",-.1,.3,0,False))
    assert len(rows)==visual["n"]*len(visual["time"])
    assert rows[0][2]==11


def test_pulse_width_and_event_changes():
    rec=build()
    rec.original[1,600]=31
    rec.original[1,601]=32  # Adjacent nonzero changes are distinct onsets.
    both=detect_triggers(rec,"Status")
    assert 31 in [e["code"] for e in both["events"]]
    assert 32 in [e["code"] for e in both["events"]]
    filtered=detect_triggers(rec,"Status",min_width_ms=8)
    assert filtered["short_rejected"]>=2
    assert 31 not in [e["code"] for e in filtered["events"]]


def test_deduplication_and_manual_exclusion():
    rec=build()
    rec.trigger_definitions=validate_definitions([
        {"code":11,"meaning":"Go","conditions":["Go"]},
        {"code":12,"meaning":"Go variant","conditions":["Go"]},
    ])
    preview=detect_triggers(rec,"Status")
    rec.events=[{"time":1.,"duration":0.,"label":"11","code":11,"source":"stim"}]
    result=commit_detected(rec,preview)
    assert result["skipped_existing"]==1
    assert len(rec.events)==5
    first=condition_epochs(rec,"Cz","Go",-.1,.2)
    assert first["n"]==3
    rec.bad_segments=[{"start":.95,"end":1.1,"reason":"Blink"}]
    curated=condition_epochs(rec,"Cz","Go",-.1,.2,exclude_marked=True)
    assert curated["n"]==2
    assert curated["excluded_manual"]==1
    assert condition_epochs(rec,"Cz","Go",-.1,.2)["n"]==3
    rec.bad_channels=["Cz"]
    with pytest.raises(ValueError,match="marked"):
        condition_epochs(rec,"Cz","Go",-.1,.2,exclude_marked=True)


def test_invalid_duplicate_codebook():
    with pytest.raises(ValueError,match="Duplicate"):
        validate_definitions([
            {"code":12,"meaning":"one","conditions":["A"]},
            {"code":12,"meaning":"two","conditions":["A"]},
        ])


def test_api_detect_preview_commit_and_csv_export():
    client=TestClient(app)
    response=client.post("/api/demo")
    assert response.status_code==200
    key=response.json()["session_id"]
    root=f"/api/sessions/{key}"
    preview=client.post(root+"/triggers/detect",json={"channel":"TRIGGER TTL"})
    assert preview.status_code==200,preview.text
    assert preview.json()["counts"]=={"11":2,"12":2,"21":2,"22":1}
    before=client.get(root).json()["events"]
    assert len(before)==7
    committed=client.post(root+"/triggers/detect",json={
        "channel":"TRIGGER TTL","commit":True})
    assert committed.status_code==200,committed.text
    assert committed.json()["commit"]["committed"]==7
    assert len(client.get(root).json()["events"])==14
    epoch=client.get(root+"/triggers/epochs",params={
        "channel":"EEG Fz","condition":"Visual","tmin":-.1,"tmax":.3})
    assert epoch.status_code==200,epoch.text
    assert epoch.json()["n"]==4
    events=client.get(root+"/triggers/export/events")
    assert events.status_code==200
    assert "Visual standard" in events.text
    epochs=client.get(root+"/triggers/export/epochs",params={
        "channel":"EEG Fz","condition":"Visual","tmin":-.1,"tmax":.3})
    assert epochs.status_code==200,epochs.text
    assert "relative_time_s" in epochs.text
    definitions=client.put(root+"/triggers/codebook",json={"definitions":[
        {"code":11,"meaning":"Visually standard","conditions":["Vision"]},
        {"code":12,"meaning":"Visually deviant","conditions":["Vision"]},
    ]})
    assert definitions.status_code==200
    assert len(definitions.json()["trigger_definitions"])==2
    assert client.delete(root).status_code==200
