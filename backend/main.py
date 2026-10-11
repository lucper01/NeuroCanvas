"""Local-only NeuroCanvas API. Do not expose to untrusted networks."""
from __future__ import annotations

import csv
import io
import json
import shutil
import tempfile
import uuid
from pathlib import Path

import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from engine import (Recording, load_recording, viewport, power_spectrum, spectrogram,
                    evoked, physiology, apply_pipeline)

app = FastAPI(title="NeuroCanvas local scientific engine", version="0.4.0",
              description="Local exploratory biosignal processing. Not for clinical use.")
TRUSTED_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:4173", "http://127.0.0.1:4173",
    "https://lucper01.github.io",
]
app.add_middleware(
    CORSMiddleware, allow_origins=TRUSTED_ORIGINS,
    allow_credentials=False, allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"], allow_private_network=True,
)
SESSIONS: dict[str, Recording] = {}
MAX_UPLOAD = 150 * 1024 * 1024


def session_or_404(key: str) -> Recording:
    if key not in SESSIONS:
        raise HTTPException(status_code=404, detail="Unknown session (sessions are ephemeral).")
    return SESSIONS[key]


def guard(action):
    try:
        return action()
    except (ValueError, RuntimeError, ImportError, OSError, IndexError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


class ViewRequest(BaseModel):
    channels: list[str] = Field(default_factory=list)
    raw: bool = False
    start: float = Field(default=0, ge=0)
    duration: float = Field(default=10, gt=0)
    max_points: int = Field(default=1500, ge=100, le=5000)


class PipelineRequest(BaseModel):
    steps: list[dict] = Field(default_factory=list, max_length=30)


class EventRequest(BaseModel):
    time: float = Field(ge=0)
    label: str = Field(min_length=1, max_length=100)
    duration: float = Field(default=0, ge=0)


@app.get("/api/health")
def health():
    import mne
    import neurokit2
    return {"status": "ok", "engine": "Python / SciPy", "mne": mne.__version__,
            "neurokit2": neurokit2.__version__, "sessions": len(SESSIONS)}


@app.post("/api/import")
async def import_file(file: UploadFile = File(...), sampling_rate: float | None = Form(default=None)):
    if sampling_rate is not None and not 0 < sampling_rate <= 100_000:
        raise HTTPException(422, "Sampling rate must be positive and <= 100000 Hz.")
    filename = Path(file.filename or "recording").name
    if filename in {"", ".", ".."}:
        raise HTTPException(422, "Invalid file name.")
    with tempfile.TemporaryDirectory(prefix="neurocanvas_") as directory:
        target = Path(directory) / filename
        size = 0
        with target.open("wb") as dest:
            while content := await file.read(1024 * 1024):
                size += len(content)
                if size > MAX_UPLOAD:
                    raise HTTPException(413, "File exceeds 150 MB upload limit.")
                dest.write(content)
        recording = guard(lambda: load_recording(target, sampling_rate, Path(directory)))
    if len(SESSIONS) >= 6:
        SESSIONS.pop(next(iter(SESSIONS)))
    key = uuid.uuid4().hex
    SESSIONS[key] = recording
    return {"session_id": key, **recording.metadata()}


@app.post("/api/demo")
def create_demo():
    rng = np.random.default_rng(17)
    fs, t = 250, np.arange(250 * 40) / 250
    eeg = 12e-6 * np.sin(2 * np.pi * 10 * t) + 4e-6 * np.sin(2 * np.pi * 20 * t)
    eeg += rng.normal(0, 2e-6, len(t))
    ecg = 0.08 * np.sin(2 * np.pi * 1.2 * t)
    for peak in np.arange(0.6, t[-1], 60 / 72):
        ecg += 1.0 * np.exp(-0.5 * ((t - peak) / 0.025) ** 2)
    eda = 1 + 0.004 * t + sum(.18 * np.exp(-(t - k) / 3) * (t >= k)
                             for k in (6, 15, 27))
    rsp = np.sin(2 * np.pi * .23 * t) + rng.normal(0, .025, len(t))
    emg = .04 * rng.standard_normal(len(t))
    emg[(t > 12) & (t < 15)] *= 5
    ttl = np.zeros(len(t))
    codes = [11, 12, 21, 22, 11, 12, 21]
    for onset, code in zip((5, 10, 15, 20, 25, 30, 35), codes):
        sample = int(round(onset * fs))
        ttl[sample:sample + 3] = code
    rec = Recording("Synthetic training signals (not human data)",
                    np.stack([eeg, ecg, eda, rsp, emg, ttl]), fs,
                    ["EEG Fz", "ECG", "EDA", "RSP", "EMG", "TRIGGER TTL"],
                    ["eeg", "ecg", "misc", "resp", "emg", "stim"],
                    ["V", "a.u.", "a.u.", "a.u.", "a.u.", "code"], "synthetic",
                    events=[{"time": float(k), "duration": 0, "label": "stimulus"}
                            for k in (5, 10, 15, 20, 25, 30, 35)])
    rec.trigger_definitions = [
        {"code":11,"meaning":"Visual standard","conditions":["Visual"]},
        {"code":12,"meaning":"Visual deviant","conditions":["Visual"]},
        {"code":21,"meaning":"Auditory standard","conditions":["Auditory"]},
        {"code":22,"meaning":"Auditory deviant","conditions":["Auditory"]},
    ]
    key = uuid.uuid4().hex
    if len(SESSIONS) >= 6:
        SESSIONS.pop(next(iter(SESSIONS)))
    SESSIONS[key] = rec
    return {"session_id": key, **rec.metadata()}


@app.get("/api/sessions/{key}")
def metadata(key: str):
    return session_or_404(key).metadata()


@app.post("/api/sessions/{key}/viewport")
def view(key: str, data: ViewRequest):
    return guard(lambda: viewport(session_or_404(key), data.channels,
                                  data.start, data.duration, data.max_points, data.raw))


@app.post("/api/sessions/{key}/pipeline")
def pipeline(key: str, body: PipelineRequest):
    return guard(lambda: apply_pipeline(session_or_404(key), body.steps))


@app.get("/api/sessions/{key}/psd")
def psd(key: str, channel: str, start: float = 0, duration: float | None = None):
    return guard(lambda: power_spectrum(session_or_404(key), channel, start, duration))


@app.get("/api/sessions/{key}/spectrogram")
def tfr(key: str, channel: str, start: float = 0, duration: float = 30):
    return guard(lambda: spectrogram(session_or_404(key), channel, start, duration))


@app.get("/api/sessions/{key}/erp")
def erp(key: str, channel: str, label: str = "", tmin: float = -0.2, tmax: float = 0.8,
        exclude_marked: bool = False):
    return guard(lambda: evoked(session_or_404(key), channel, label, tmin, tmax,
                                exclude_marked=exclude_marked))


@app.get("/api/sessions/{key}/physiology")
def bio(key: str, channel: str, modality: str):
    return guard(lambda: physiology(session_or_404(key), channel, modality))


@app.post("/api/sessions/{key}/events")
def add_event(key: str, event: EventRequest):
    rec = session_or_404(key)
    if event.time > rec.duration:
        raise HTTPException(422, "Event is outside recording.")
    rec.events.append(event.model_dump())
    rec.events.sort(key=lambda item: float(item["time"]))
    return rec.metadata()


@app.get("/api/sessions/{key}/export/metadata")
def export_meta(key: str):
    rec = session_or_404(key)
    return rec.metadata()


@app.get("/api/sessions/{key}/export/csv")
def export_csv(key: str, processed: bool = True):
    rec = session_or_404(key)
    data = rec.processed if processed else rec.original
    def rows():
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["time_s", *rec.names])
        yield stream.getvalue()
        stream.seek(0)
        stream.truncate()
        for i in range(data.shape[1]):
            writer.writerow([i / rec.sfreq, *data[:, i].tolist()])
            yield stream.getvalue()
            stream.seek(0)
            stream.truncate()
    return StreamingResponse(rows(), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=neurocanvas_export.csv"})


@app.delete("/api/sessions/{key}")
def delete_session(key: str):
    session_or_404(key)
    del SESSIONS[key]
    return {"deleted": True}


# Extended signal analysis API (no component rejection is performed automatically).
from advanced import (
    quality_report, fft_amplitude, coherence_report, mne_power, mne_epochs,
    head_positions, ica_preview, nk_hrv,
)


class ChannelEdit(BaseModel):
    type: str
    unit: str = Field(min_length=1, max_length=30)


@app.put("/api/sessions/{key}/channels/{index}")
def edit_channel(key: str, index: int, body: ChannelEdit):
    rec = session_or_404(key)
    valid = {"eeg", "eog", "ecg", "emg", "misc", "stim", "resp", "bio", "seeg", "ecog"}
    if index < 0 or index >= len(rec.names):
        raise HTTPException(404, "Unknown channel index.")
    if body.type not in valid:
        raise HTTPException(422, "Unsupported channel type.")
    rec.types[index] = body.type
    rec.units[index] = body.unit
    rec.warnings.append("User-assigned sensor metadata: values were not rescaled. Verify the numeric unit.")
    return rec.metadata()


@app.get("/api/sessions/{key}/quality")
def quality(key: str):
    return guard(lambda: quality_report(session_or_404(key)))


@app.get("/api/sessions/{key}/fft")
def fft(key: str, channel: str, start: float = 0, duration: float = 30):
    return guard(lambda: fft_amplitude(session_or_404(key), channel, start, duration))


@app.get("/api/sessions/{key}/coherence")
def coherence(key: str, first: str, second: str, start: float = 0, duration: float = 30):
    return guard(lambda: coherence_report(session_or_404(key), first, second, start, duration))


@app.get("/api/sessions/{key}/mne/psd")
def mne_psd(key: str, start: float = 0, duration: float = 30, fmin: float = 1, fmax: float = 45):
    return guard(lambda: mne_power(session_or_404(key), start, duration, fmin, fmax))


@app.get("/api/sessions/{key}/mne/epochs")
def mne_erp(key: str, label: str, tmin: float = -.2, tmax: float = .8,
            reject_peak_uv: float | None = None, exclude_marked: bool = False):
    return guard(lambda: mne_epochs(session_or_404(key), label, tmin, tmax,
                                    reject_peak_uv=reject_peak_uv,
                                    exclude_marked=exclude_marked))


@app.get("/api/sessions/{key}/mne/montage")
def montage(key: str):
    return guard(lambda: head_positions(session_or_404(key)))


@app.get("/api/sessions/{key}/mne/ica")
def ica(key: str, n_components: int = Query(10, ge=2, le=20)):
    return guard(lambda: ica_preview(session_or_404(key), n_components))


@app.get("/api/sessions/{key}/neurokit/hrv")
def hrv(key: str, channel: str):
    return guard(lambda: nk_hrv(session_or_404(key), channel))


# Curated QC decisions are metadata only. No original samples are overwritten.
from advanced import windowed_quality


class MarkedSegment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    reason: str = Field(min_length=2, max_length=180)


class MarkedChannel(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    marked: bool = True


@app.get("/api/sessions/{key}/qc/windows")
def quality_windows(key: str, window_seconds: float = Query(2.0, ge=0.2, le=60),
                    channel: str | None = None):
    return guard(lambda: windowed_quality(
        session_or_404(key), window_seconds, channel,
    ))


@app.post("/api/sessions/{key}/qc/segments")
def add_bad_segment(key: str, body: MarkedSegment):
    recording = session_or_404(key)
    if body.start >= body.end or body.end > recording.duration + 1 / recording.sfreq:
        raise HTTPException(422, "Invalid segment bounds.")
    if len(recording.bad_segments) >= 500:
        raise HTTPException(422, "Maximum 500 marked segments per recording.")
    recording.bad_segments.append(body.model_dump())
    recording.bad_segments.sort(key=lambda item: item["start"])
    return recording.metadata()


@app.delete("/api/sessions/{key}/qc/segments/{index}")
def remove_bad_segment(key: str, index: int):
    recording = session_or_404(key)
    if not 0 <= index < len(recording.bad_segments):
        raise HTTPException(404, "Unknown marked-segment index.")
    recording.bad_segments.pop(index)
    return recording.metadata()


@app.post("/api/sessions/{key}/qc/channels")
def mark_bad_channel(key: str, body: MarkedChannel):
    recording = session_or_404(key)
    if body.name not in recording.names:
        raise HTTPException(422, "Unknown channel name.")
    recording.bad_channels = [
        name for name in recording.bad_channels if name != body.name
    ]
    if body.marked:
        recording.bad_channels.append(body.name)
    return recording.metadata()


@app.get("/api/sessions/{key}/qc/export")
def export_qc(key: str):
    recording = session_or_404(key)
    return {"recording": recording.name,
            "sfreq": recording.sfreq,
            "bad_channels": recording.bad_channels,
            "bad_segments": recording.bad_segments,
            "note": "Manual decisions, not automatically established artifacts."}


# Trigger detection and experimental-condition model.
from triggers import (detect_triggers, validate_definitions, commit_detected,
                      condition_epochs, map_trigger)


class TriggerDefinition(BaseModel):
    code: int = Field(ge=1, le=16777215)
    meaning: str = Field(min_length=1, max_length=180)
    conditions: list[str] = Field(default_factory=list, max_length=16)


class TriggerCodebook(BaseModel):
    definitions: list[TriggerDefinition] = Field(default_factory=list, max_length=2000)


class TriggerDetection(BaseModel):
    channel: str = Field(min_length=1)
    bit_mask: int | None = Field(default=None, ge=1, le=16777215)
    min_width_ms: float = Field(default=0, ge=0, le=1000)
    min_interval_ms: float = Field(default=0, ge=0, le=5000)
    tolerance: float = Field(default=.25, ge=0, le=.49)
    commit: bool = False


@app.put("/api/sessions/{key}/triggers/codebook")
def update_trigger_codebook(key: str, body: TriggerCodebook):
    rec = session_or_404(key)
    rec.trigger_definitions = guard(lambda: validate_definitions([
        item.model_dump() for item in body.definitions
    ]))
    return rec.metadata()


@app.post("/api/sessions/{key}/triggers/detect")
def trigger_detector(key: str, body: TriggerDetection):
    rec = session_or_404(key)
    detection = guard(lambda: detect_triggers(
        rec, body.channel, body.min_width_ms, body.min_interval_ms, body.tolerance, body.bit_mask,
    ))
    if body.commit:
        detection["commit"] = commit_detected(rec, detection)
        detection["metadata"] = rec.metadata()
    return detection


@app.get("/api/sessions/{key}/triggers/events")
def trigger_event_list(key: str, condition: str = ""):
    rec = session_or_404(key)
    events = [map_trigger(ev, rec.trigger_definitions) for ev in rec.events]
    if condition:
        events = [ev for ev in events if condition in ev["conditions"]]
    return {"events": events, "count": len(events), "condition": condition,
            "conditions": sorted({c for d in rec.trigger_definitions for c in d["conditions"]})}


@app.get("/api/sessions/{key}/triggers/epochs")
def trigger_epochs(key: str, channel: str, condition: str = "",
                   tmin: float = -.2, tmax: float = .8,
                   baseline_end: float = 0, exclude_marked: bool = False,
                   exclude_rejected: bool = False,
                   trial_offset: int = Query(0, ge=0),
                   trial_limit: int = Query(100, ge=1, le=200)):
    return guard(lambda: condition_epochs(
        session_or_404(key), channel, condition, tmin, tmax,
        baseline_end, exclude_marked, max_trials=trial_limit,
        exclude_rejected=exclude_rejected, trial_offset=trial_offset,
    ))


@app.get("/api/sessions/{key}/triggers/export/events")
def export_trigger_events(key: str):
    rec = session_or_404(key)
    lines = io.StringIO()
    writer = csv.writer(lines)
    from review import event_uid
    writer.writerow(["onset_s", "duration_s", "sample", "code", "label",
                     "meaning", "conditions", "source", "event_uid"])
    for event in sorted(rec.events, key=lambda item: float(item["time"])):
        mapped = map_trigger(event, rec.trigger_definitions)
        writer.writerow([
            event["time"], event.get("duration", 0),
            int(round(float(event["time"]) * rec.sfreq)),
            mapped["code"] if mapped["code"] is not None else "",
            event.get("label", ""), mapped["meaning"],
            "|".join(mapped["conditions"]), event.get("source", "manual"),
            event_uid(rec, event),
        ])
    return StreamingResponse(iter([lines.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=neurocanvas_triggers.csv"})


@app.get("/api/sessions/{key}/triggers/export/codebook")
def export_trigger_codebook(key: str):
    rec = session_or_404(key)
    return {"definitions": rec.trigger_definitions,
            "conditions": sorted({c for d in rec.trigger_definitions for c in d["conditions"]}),
            "recording": rec.name, "sfreq": rec.sfreq}


@app.get("/api/sessions/{key}/triggers/export/epochs")
def export_trigger_epochs(key: str, channel: str, condition: str = "",
                          tmin: float = -.2, tmax: float = .8,
                          baseline_end: float = 0, exclude_marked: bool = False,
                          exclude_rejected: bool = False):
    rec = session_or_404(key)
    result = guard(lambda: condition_epochs(rec, channel, condition, tmin, tmax,
                                            baseline_end, exclude_marked, max_trials=0,
                                            exclude_rejected=exclude_rejected))
    if result["n"] > 1000 or result["n"] * len(result["time"]) > 1_000_000:
        raise HTTPException(422, "CSV epoch export is limited to 1 million values / 1000 epochs.")
    # Export the full underlying epochs, not the UI-decimated trial samples.
    from triggers import epoch_rows
    def rows():
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["trial_index", "condition", "code", "meaning", "onset_s",
                         "relative_time_s", "amplitude", "unit",
                         "event_uid", "review_rejected", "review_reason"])
        yield stream.getvalue()
        stream.seek(0)
        stream.truncate()
        for row in epoch_rows(rec, channel, condition, tmin, tmax, baseline_end,
                              exclude_marked, exclude_rejected):
            writer.writerow(row)
            yield stream.getvalue()
            stream.seek(0)
            stream.truncate()
    return StreamingResponse(rows(), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=neurocanvas_epochs.csv"})



@app.get("/api/sessions/{key}/triggers/export/multichannel")
def export_multichannel_epochs(key: str, condition: str = "",
                               tmin: float = -.2, tmax: float = .8,
                               baseline_end: float = 0,
                               exclude_marked: bool = False,
                               exclude_rejected: bool = False):
    from triggers import multichannel_epochs_npz
    result = guard(lambda: multichannel_epochs_npz(
        session_or_404(key), condition, tmin, tmax, baseline_end, exclude_marked,
        exclude_rejected
    ))
    return StreamingResponse(result, media_type="application/octet-stream",
                             headers={"Content-Disposition": "attachment; filename=neurocanvas_multichannel_epochs.npz"})



# Single-trial research decisions and descriptive measurement reports.
from review import event_uid, set_decision, decisions_export, condition_metrics


class TrialReviewRequest(BaseModel):
    event_uid: str = Field(min_length=1, max_length=120)
    rejected: bool
    reason: str = Field(default="", max_length=180)


@app.post("/api/sessions/{key}/trials/review")
def review_trial(key: str, body: TrialReviewRequest):
    rec = session_or_404(key)
    result = guard(lambda: set_decision(
        rec, body.event_uid, body.rejected, body.reason
    ))
    return {**result, "metadata": rec.metadata()}


@app.get("/api/sessions/{key}/trials/review")
def trial_review_log(key: str):
    return decisions_export(session_or_404(key))


@app.get("/api/sessions/{key}/triggers/metrics")
def trigger_metrics(key: str, channel: str,
                    tmin: float = -.2, tmax: float = .8,
                    measure_start: float = 0., measure_end: float = .3,
                    baseline_end: float = 0.,
                    exclude_marked: bool = False,
                    exclude_rejected: bool = False):
    return guard(lambda: condition_metrics(
        session_or_404(key), channel, tmin, tmax,
        measure_start, measure_end, baseline_end,
        exclude_marked, exclude_rejected
    ))


@app.get("/api/sessions/{key}/triggers/export/metrics")
def export_trigger_metrics(key: str, channel: str,
                           tmin: float = -.2, tmax: float = .8,
                           measure_start: float = 0., measure_end: float = .3,
                           baseline_end: float = 0.,
                           exclude_marked: bool = False,
                           exclude_rejected: bool = False):
    result = trigger_metrics(key, channel, tmin, tmax, measure_start, measure_end,
                             baseline_end, exclude_marked, exclude_rejected)
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow([
        "condition", "n", "status", "mean_amplitude", "peak_amplitude",
        "peak_latency_s", "signed_auc", "unit", "codes",
        "excluded_bounds", "excluded_manual", "excluded_rejected",
        "measure_start_s", "measure_end_s", "exclude_marked", "exclude_rejected",
    ])
    for row in result["conditions"]:
        writer.writerow([
            row.get("condition"), row.get("n"), row.get("status"),
            row.get("mean_amplitude"), row.get("peak_amplitude"),
            row.get("peak_latency_s"), row.get("auc"), row.get("unit"),
            json.dumps(row.get("codes", {}), sort_keys=True),
            row.get("excluded_bounds"), row.get("excluded_manual"),
            row.get("excluded_rejected"), measure_start, measure_end,
            exclude_marked, exclude_rejected,
        ])
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition":
                                      "attachment; filename=neurocanvas_condition_metrics.csv"})
