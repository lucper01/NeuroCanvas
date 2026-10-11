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

app = FastAPI(title="NeuroCanvas local scientific engine", version="0.1.0",
              description="Local exploratory biosignal processing. Not for clinical use.")
app.add_middleware(CORSMiddleware, allow_origins=[
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:4173", "http://127.0.0.1:4173",
    "https://lucper01.github.io",
], allow_credentials=False, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"])
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
    rec = Recording("Synthetic training signals (not human data)",
                    np.stack([eeg, ecg, eda, rsp, emg]), fs,
                    ["EEG Fz", "ECG", "EDA", "RSP", "EMG"],
                    ["eeg", "ecg", "misc", "resp", "emg"],
                    ["V", "a.u.", "a.u.", "a.u.", "a.u."], "synthetic",
                    events=[{"time": float(k), "duration": 0, "label": "stimulus"}
                            for k in (5, 10, 15, 20, 25, 30, 35)])
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
def erp(key: str, channel: str, label: str = "", tmin: float = -0.2, tmax: float = 0.8):
    return guard(lambda: evoked(session_or_404(key), channel, label, tmin, tmax))


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
            reject_peak_uv: float | None = None):
    return guard(lambda: mne_epochs(session_or_404(key), label, tmin, tmax,
                                    reject_peak_uv=reject_peak_uv))


@app.get("/api/sessions/{key}/mne/montage")
def montage(key: str):
    return guard(lambda: head_positions(session_or_404(key)))


@app.get("/api/sessions/{key}/mne/ica")
def ica(key: str, n_components: int = Query(10, ge=2, le=20)):
    return guard(lambda: ica_preview(session_or_404(key), n_components))


@app.get("/api/sessions/{key}/neurokit/hrv")
def hrv(key: str, channel: str):
    return guard(lambda: nk_hrv(session_or_404(key), channel))
