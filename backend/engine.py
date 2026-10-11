"""Scientific signal processing; explicit units, sampling rates and provenance."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import io
import json
import zipfile

import numpy as np
import pandas as pd
from scipy import signal


MAX_VALUES = 20_000_000
MAX_ARCHIVE_BYTES = 250 * 1024 * 1024


@dataclass
class Recording:
    name: str
    original: np.ndarray
    sfreq: float
    names: list[str]
    types: list[str]
    units: list[str]
    source: str
    events: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    steps: list[dict] = field(default_factory=list)
    processed: np.ndarray | None = None
    bad_channels: list[str] = field(default_factory=list)
    bad_segments: list[dict] = field(default_factory=list)

    def __post_init__(self):
        self.original = np.asarray(self.original, dtype=np.float64)
        if self.original.ndim != 2 or self.original.size == 0:
            raise ValueError("Expected a nonempty channels × samples matrix.")
        if self.original.size > MAX_VALUES:
            raise ValueError("Recording is too large for this in-memory release (20 million values maximum).")
        if not np.isfinite(self.sfreq) or self.sfreq <= 0:
            raise ValueError("A strictly positive sampling frequency is required.")
        if len(self.names) != self.original.shape[0]:
            raise ValueError("Channel metadata do not match data.")
        if not np.isfinite(self.original).all():
            for row in self.original:
                ok = np.isfinite(row)
                if ok.sum() < 2:
                    raise ValueError("Channel has fewer than two valid samples.")
                if not ok.all():
                    x = np.arange(len(row))
                    row[~ok] = np.interp(x[~ok], x[ok], row[ok])
                    self.warnings.append("Missing/nonfinite values were linearly interpolated.")
        self.processed = self.original.copy()

    @property
    def duration(self):
        return (self.original.shape[1] - 1) / self.sfreq

    def metadata(self):
        return {
            "name": self.name, "sfreq": self.sfreq, "duration": self.duration,
            "samples": int(self.original.shape[1]), "channels": [
                {"name": n, "type": t, "unit": u}
                for n, t, u in zip(self.names, self.types, self.units)
            ], "source": self.source, "events": self.events,
            "warnings": sorted(set(self.warnings)), "history": self.steps,
            "bad_channels": list(self.bad_channels),
            "bad_segments": [dict(segment) for segment in self.bad_segments],
        }


def _extract_safe_zip(path: Path, folder: Path):
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        if sum(m.file_size for m in members) > MAX_ARCHIVE_BYTES:
            raise ValueError("Archive uncompressed size exceeds 250 MB.")
        for member in members:
            target = (folder / member.filename).resolve()
            if not target.is_relative_to(folder.resolve()):
                raise ValueError("Unsafe archive path.")
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as src, target.open("wb") as dst:
                    import shutil
                    shutil.copyfileobj(src, dst, length=1024 * 1024)
    candidates = [
        p for p in folder.rglob("*")
        if p.suffix.lower() in {".vhdr", ".set", ".edf", ".bdf", ".fif", ".csv", ".tsv", ".acq"}
    ]
    if not candidates:
        raise ValueError("ZIP has no supported recording.")
    return sorted(candidates, key=lambda p: (
        {".vhdr": 0, ".set": 1, ".bdf": 2, ".edf": 3, ".fif": 4}.get(p.suffix.lower(), 5), str(p)
    ))[0]


def load_recording(path: Path, sfreq: float | None, workdir: Path):
    ext = path.suffix.lower()
    if ext == ".zip":
        path = _extract_safe_zip(path, workdir / "extracted")
        ext = path.suffix.lower()

    if ext in {".csv", ".tsv"}:
        delimiter = "\t" if ext == ".tsv" else None
        df = pd.read_csv(path, sep=delimiter, engine="python")
        df = df.loc[:, ~df.columns.astype(str).str.startswith("Unnamed:")]
        if df.empty:
            raise ValueError("No rows in file.")
        time_col = next((c for c in df.columns if str(c).lower().strip() in {
            "time", "time_s", "time (s)", "seconds", "timestamp_s", "t"
        }), None)
        inferred = None
        if time_col is not None:
            times = pd.to_numeric(df.pop(time_col).astype(str).str.replace(",", ".", regex=False),
                                  errors="raise").to_numpy(dtype=float)
            intervals = np.diff(times)
            if len(intervals) and np.all(np.isfinite(intervals)) and np.all(intervals > 0):
                delta = float(np.median(intervals))
                if np.allclose(intervals, delta, rtol=0.02, atol=1e-7):
                    inferred = 1.0 / delta
        if time_col is not None and inferred is None:
            raise ValueError("Time column is not strictly increasing and uniformly sampled. Resample before import.")
        if sfreq is None:
            if inferred is None:
                raise ValueError("CSV without a uniform time_s column requires sampling_rate.")
            sfreq = inferred
        numeric = df.apply(lambda col: pd.to_numeric(
            col.astype(str).str.replace(",", ".", regex=False), errors="coerce"))
        if numeric.isna().all(axis=0).any():
            raise ValueError("CSV contains a fully nonnumeric signal column.")
        data = numeric.to_numpy(dtype=float).T
        rec = Recording(path.name, data, float(sfreq), [str(c) for c in numeric.columns],
                        ["misc"] * len(numeric.columns), ["a.u."] * len(numeric.columns), ext[1:])
        if inferred is not None and sfreq is not None and abs(float(sfreq) - inferred) / inferred > 0.02:
            rec.warnings.append("Provided sampling rate differs from time-column sampling rate.")
        if time_col is not None and len(times) and abs(times[0]) > 1e-9:
            rec.warnings.append("Nonzero CSV time origin: displayed sample times start at 0 s.")
        return rec

    if ext == ".acq":
        try:
            import bioread
        except ImportError as e:
            raise ValueError("Install bioread to read ACQ files.") from e
        acq = bioread.read_file(str(path))
        channels = list(acq.channels)
        rates = [float(c.samples_per_second) for c in channels]
        if not rates or not np.allclose(rates, rates[0]):
            raise ValueError("ACQ channels have different rates; resample explicitly before import.")
        lengths = [len(c.data) for c in channels]
        if len(set(lengths)) != 1:
            raise ValueError("ACQ channel lengths differ.")
        return Recording(path.name, np.vstack([c.data for c in channels]), rates[0],
                         [c.name for c in channels], ["misc"] * len(channels),
                         [str(getattr(c, "units", "a.u.")) for c in channels], "bioread")

    try:
        import mne
    except ImportError as e:
        raise ValueError("Install MNE-Python to read electrophysiology formats.") from e
    readers = {
        ".bdf": mne.io.read_raw_bdf,
        ".edf": mne.io.read_raw_edf,
        ".vhdr": mne.io.read_raw_brainvision,
        ".fif": mne.io.read_raw_fif,
        ".set": mne.io.read_raw_eeglab,
    }
    if ext not in readers:
        raise ValueError("Unsupported format. Use CSV, TSV, BDF, EDF, FIF, VHDR, SET, ACQ or ZIP.")
    raw = readers[ext](str(path), preload=False, verbose="ERROR")
    if len(raw.ch_names) * raw.n_times > MAX_VALUES:
        raise ValueError("Recording too large for in-memory analysis; use a preselected segment.")
    matrix = raw.get_data()
    annotations = []
    for a in raw.annotations:
        annotations.append({"time": float(a["onset"]), "duration": float(a["duration"]),
                            "label": str(a["description"])})
    # For EDF/BDF/FIF acquisitions, event codes can be encoded on stim channels
    # rather than annotations; retain those event labels and sample positions.
    stim = [n for n, kind in zip(raw.ch_names, raw.get_channel_types()) if kind == "stim"]
    if stim:
        try:
            found = mne.find_events(raw, stim_channel=stim, shortest_event=1,
                                    initial_event=True, verbose="ERROR")
            for sample, _, code in found:
                annotations.append({"time": float((sample - raw.first_samp) / raw.info["sfreq"]),
                                    "duration": 0.0, "label": str(int(code))})
        except (ValueError, RuntimeError):
            pass  # The visible stim channels remain importable even without events.
    annotations.sort(key=lambda ev: ev["time"])
    types = raw.get_channel_types()
    units = ["V" if kind in {"eeg", "eog", "ecg", "emg", "seeg", "ecog"} else "SI" for kind in types]
    return Recording(path.name, matrix, float(raw.info["sfreq"]), list(raw.ch_names),
                     types, units, "mne:" + ext[1:], events=annotations)


def apply_pipeline(rec: Recording, steps: list[dict]):
    """Recompute the entire non-destructive pipeline from raw samples."""
    data = rec.original.copy()
    fs = rec.sfreq
    for step in steps:
        method = step.get("method")
        picks = rec.names if "channels" not in step else step["channels"]
        if not isinstance(picks, list):
            raise ValueError("Step channels must be a list of names.")
        unknown = [name for name in picks if name not in rec.names]
        if unknown:
            raise ValueError("Unknown step channel: " + ", ".join(map(str, unknown)))
        indices = [rec.names.index(n) for n in picks]
        if not indices:
            raise ValueError("No matching channels for processing.")
        if method == "filter":
            low = step.get("low")
            high = step.get("high")
            low = float(low) if low not in ("", None) else None
            high = float(high) if high not in ("", None) else None
            ny = fs / 2
            if low is None and high is None:
                raise ValueError("Specify a high-pass and/or low-pass cutoff.")
            if (low is not None and not 0 < low < ny) or (high is not None and not 0 < high < ny):
                raise ValueError("Cutoffs must be between 0 and Nyquist.")
            if low is not None and high is not None and low >= high:
                raise ValueError("High-pass cutoff must be smaller than low-pass.")
            order = int(step.get("order", 4))
            if order < 1 or order > 8:
                raise ValueError("Filter order must be between 1 and 8.")
            mode = "bandpass" if low is not None and high is not None else ("highpass" if low else "lowpass")
            wn = [low, high] if mode == "bandpass" else (low if low else high)
            sos = signal.butter(order, wn, btype=mode, fs=fs, output="sos")
            data[indices] = signal.sosfiltfilt(sos, data[indices], axis=-1)
        elif method == "notch":
            frequency = float(step.get("frequency", 50))
            quality = float(step.get("quality", 30))
            if not 0 < frequency < fs / 2 or not 1 <= quality <= 100:
                raise ValueError("Invalid notch frequency or quality.")
            b, a = signal.iirnotch(frequency, quality, fs)
            data[indices] = signal.filtfilt(b, a, data[indices], axis=-1)
        elif method == "detrend":
            data[indices] = signal.detrend(data[indices], axis=-1, type="linear")
        elif method == "demean":
            data[indices] -= np.mean(data[indices], axis=-1, keepdims=True)
        elif method == "rectify":
            data[indices] = np.abs(data[indices])
        elif method == "average_reference":
            eeg = [i for i in indices if rec.types[i] == "eeg"]
            if len(eeg) < 2:
                raise ValueError("Average reference requires at least two EEG channels typed as EEG.")
            data[eeg] -= np.mean(data[eeg], axis=0, keepdims=True)
        else:
            raise ValueError("Unknown processing operation: " + str(method))
    rec.processed = data
    rec.steps = [dict(s) for s in steps]
    return rec.metadata()


def viewport(rec: Recording, names: list[str], start: float, duration: float, max_points: int = 1200, raw: bool = False):
    if not names:
        names = rec.names[:8]
    lo = max(0, int(start * rec.sfreq))
    hi = min(rec.original.shape[1], max(lo + 1, int((start + duration) * rec.sfreq)))
    if hi <= lo:
        raise ValueError("Time window outside recording.")
    max_points = max(100, min(int(max_points), 5000))
    output = []
    for name in names[:20]:
        if name not in rec.names:
            continue
        i = rec.names.index(name)
        y = (rec.original if raw else rec.processed)[i, lo:hi]
        if len(y) <= max_points:
            loc = np.arange(len(y), dtype=int)
        else:
            # Min/max decimation preserves narrow peaks and avoids misleading averages.
            edge = np.linspace(0, len(y), max(2, max_points // 2) + 1, dtype=int)
            locs = []
            for a, b in zip(edge[:-1], edge[1:]):
                if b > a:
                    locs.extend([a + int(np.argmin(y[a:b])), a + int(np.argmax(y[a:b]))])
            loc = np.array(sorted(set(locs)), dtype=int)
        x = (lo + loc) / rec.sfreq
        output.append({"name": name, "unit": rec.units[i], "type": rec.types[i],
                       "x": np.round(x, 6).tolist(), "y": y[loc].tolist()})
    return {"traces": output, "start": lo / rec.sfreq, "end": (hi - 1) / rec.sfreq}


def power_spectrum(rec: Recording, channel: str, start: float = 0, duration: float | None = None):
    if channel not in rec.names:
        raise ValueError("Unknown channel.")
    lo = max(0, int(start * rec.sfreq))
    hi = min(rec.original.shape[1], int((start + duration) * rec.sfreq) if duration else rec.original.shape[1])
    y = rec.processed[rec.names.index(channel), lo:hi]
    if len(y) < 16:
        raise ValueError("Select at least 16 samples.")
    nperseg = min(len(y), 2048)
    f, psd = signal.welch(y, fs=rec.sfreq, window="hann", nperseg=nperseg, noverlap=nperseg // 2)
    return {"frequency": f.tolist(), "psd": psd.tolist(),
            "unit": rec.units[rec.names.index(channel)] + "²/Hz",
            "method": "Welch, Hann, 50% overlap", "nperseg": nperseg}


def spectrogram(rec: Recording, channel: str, start: float = 0, duration: float = 60):
    if channel not in rec.names:
        raise ValueError("Unknown channel.")
    lo = max(0, int(start * rec.sfreq))
    hi = min(rec.original.shape[1], int((start + duration) * rec.sfreq))
    y = rec.processed[rec.names.index(channel), lo:hi]
    if len(y) < 32:
        raise ValueError("Select at least 32 samples.")
    nperseg = min(256, max(32, 2 ** int(np.log2(len(y) // 4 or 1))))
    f, t, s = signal.spectrogram(y, fs=rec.sfreq, window="hann", nperseg=nperseg,
                                 noverlap=nperseg // 2, mode="psd")
    mask = f <= min(100, rec.sfreq / 2)
    return {"frequency": f[mask].tolist(), "time": (t + lo / rec.sfreq).tolist(),
            "power": (10 * np.log10(np.maximum(s[mask], 1e-24))).tolist(),
            "unit": "dB (re 1 unit²/Hz)"}


def evoked(rec: Recording, channel: str, label: str, tmin: float = -0.2, tmax: float = 0.8,
           baseline_end: float = 0, exclude_marked: bool = False):
    if channel not in rec.names or tmin >= tmax:
        raise ValueError("Invalid channel or epoch window.")
    if not tmin <= baseline_end <= tmax:
        raise ValueError("Baseline end is outside epoch.")
    if exclude_marked and channel in rec.bad_channels:
        raise ValueError("This channel is marked bad. Unmark it or choose a different channel.")
    start_samp, end_samp = int(round(tmin * rec.sfreq)), int(round(tmax * rec.sfreq))
    times = np.arange(start_samp, end_samp + 1) / rec.sfreq
    episodes = []
    excluded = 0
    for ev in rec.events:
        if label and str(ev["label"]) != label:
            continue
        onset = int(round(float(ev["time"]) * rec.sfreq))
        i, j = onset + start_samp, onset + end_samp + 1
        if i < 0 or j > rec.original.shape[1]:
            excluded += 1
            continue
        if exclude_marked and any(
            float(mark["start"]) < j / rec.sfreq
            and float(mark["end"]) > i / rec.sfreq
            for mark in rec.bad_segments
        ):
            excluded += 1
            continue
        segment = rec.processed[rec.names.index(channel), i:j].copy()
        base = times <= baseline_end
        if np.any(base) and tmin < baseline_end:
            segment -= segment[base].mean()
        episodes.append(segment)
    if not episodes:
        raise ValueError("No valid epochs for this event label.")
    epochs = np.vstack(episodes)
    return {"time": times.tolist(), "mean": epochs.mean(axis=0).tolist(),
            "sem": (epochs.std(axis=0, ddof=1) / np.sqrt(len(epochs))).tolist()
                   if len(epochs) > 1 else [None] * len(times),
            "n": len(epochs), "excluded": excluded, "unit": rec.units[rec.names.index(channel)],
            "exclude_marked": bool(exclude_marked)}


def physiology(rec: Recording, channel: str, modality: str):
    if channel not in rec.names:
        raise ValueError("Unknown channel.")
    import neurokit2 as nk
    methods = {"ecg": nk.ecg_process, "eda": nk.eda_process, "rsp": nk.rsp_process,
               "emg": nk.emg_process, "ppg": nk.ppg_process, "eog": nk.eog_process}
    if modality not in methods:
        raise ValueError("Supported modalities: ecg, eda, rsp, emg, ppg, eog.")
    idx = rec.names.index(channel)
    values = rec.processed[idx]
    if len(values) < rec.sfreq * 2:
        raise ValueError("Physiology requires at least 2 seconds of samples.")
    if len(values) > 1_000_000:
        raise ValueError("Physiology currently limited to 1 million samples per analysis.")
    signals, info = methods[modality](values, sampling_rate=rec.sfreq)
    markers = {}
    for col in signals:
        if col.endswith(("_Peaks", "_Onsets", "_Offsets", "_Troughs")):
            markers[col] = np.flatnonzero(signals[col].to_numpy() == 1).tolist()[:3000]
    measures = {}
    for col in signals:
        if col.endswith(("_Rate", "_Amplitude", "_Tonic", "_Phasic", "_Quality")):
            vals = pd.to_numeric(signals[col], errors="coerce").to_numpy(dtype=float)
            if np.isfinite(vals).any():
                measures[col + "_mean"] = float(np.nanmean(vals))
    wanted = [c for c in signals.columns if c.endswith(("_Clean", "_Rate", "_Tonic", "_Phasic", "_Amplitude"))]
    stride = max(1, int(np.ceil(len(signals) / 1500)))
    return {"modality": modality, "channel": channel, "summary": measures,
            "markers": markers, "series": [
                {"name": col, "time": (np.arange(0, len(signals), stride) / rec.sfreq).tolist(),
                 "values": [float(v) if np.isfinite(v) else None for v in pd.to_numeric(
                     signals[col].iloc[::stride], errors="coerce").to_numpy(dtype=float)]}
                for col in wanted[:6]
            ], "software": "NeuroKit2", "sampling_rate": rec.sfreq}
