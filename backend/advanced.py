"""Advanced research-oriented explorations with MNE and SciPy.

Non-diagnostic. Channel metadata, acquisition units, reference, artifact handling
and signal quality must be verified by the researcher before interpretation.
"""
from __future__ import annotations

import numpy as np
from scipy import signal


def quality_report(recording):
    """Descriptive QC metrics, deliberately without universal pass/fail thresholds."""
    matrix = recording.processed
    fs = recording.sfreq
    rows = []
    for idx, (name, values) in enumerate(zip(recording.names, matrix)):
        centered = values - np.mean(values)
        diff = np.diff(values)
        rms = np.sqrt(np.mean(values ** 2))
        q1, q3 = np.percentile(values, [25, 75])
        rows.append({
            "name": name, "type": recording.types[idx], "unit": recording.units[idx],
            "mean": float(np.mean(values)), "rms": float(rms),
            "std": float(np.std(values)), "min": float(np.min(values)), "max": float(np.max(values)),
            "ptp": float(np.ptp(values)), "iqr": float(q3 - q1),
            "derivative_std": float(np.std(diff) * fs) if len(diff) else 0,
            "near_constant": bool(np.max(np.abs(centered)) < 1e-12),
        })
    return {
        "source": recording.source, "name": recording.name,
        "samples": matrix.shape[1], "channels": rows,
        "flags": ["Descriptive only: amplitude and quality thresholds depend on modality and hardware.",
                  "Missing/nonfinite samples may have been interpolated during import.",
                  "An acquisition with flat channels can still be valid for certain sensor types."],
        "sampling_rate": fs,
    }


def fft_amplitude(recording, channel, start=0, duration=None):
    if channel not in recording.names:
        raise ValueError("Unknown channel.")
    fs = recording.sfreq
    lo = max(0, int(start * fs))
    hi = min(recording.original.shape[1], int((start + duration) * fs) if duration else recording.original.shape[1])
    values = recording.processed[recording.names.index(channel), lo:hi]
    if len(values) < 16:
        raise ValueError("Select at least 16 samples.")
    if len(values) > 65536:
        raise ValueError("Select an FFT window of at most 65536 samples.")
    taper = np.hanning(len(values))
    Fourier = np.fft.rfft((values - np.mean(values)) * taper)
    amplitudes = np.abs(Fourier) * 2 / np.sum(taper)
    amplitudes[0] /= 2
    if len(values) % 2 == 0:
        amplitudes[-1] /= 2
    frequencies = np.fft.rfftfreq(len(values), d=1 / fs)
    return {"frequency": frequencies.tolist(), "amplitude": amplitudes.tolist(),
            "unit": recording.units[recording.names.index(channel)],
            "method": "Single-sided amplitude spectrum; Hann taper, coherent-gain correction"}


def coherence_report(recording, first, second, start=0, duration=30):
    if first not in recording.names or second not in recording.names or first == second:
        raise ValueError("Choose two distinct existing channels.")
    fs = recording.sfreq
    a = max(0, int(start * fs))
    b = min(recording.original.shape[1], int((start + duration) * fs))
    if b - a < 256:
        raise ValueError("Coherence requires at least 256 samples and several Welch segments.")
    x = recording.processed[recording.names.index(first), a:b]
    y = recording.processed[recording.names.index(second), a:b]
    nperseg = min(1024, max(64, len(x) // 4))
    f, coh = signal.coherence(x, y, fs=fs, nperseg=nperseg, noverlap=nperseg // 2)
    return {"frequency": f.tolist(), "coherence": coh.tolist(),
            "first": first, "second": second,
            "description": "Magnitude-squared coherence (Welch), non-directional association; not causality."}


def _mne_eeg(recording):
    import mne
    indices = [i for i, kind in enumerate(recording.types) if kind == "eeg"]
    if len(indices) < 2:
        raise ValueError("MNE EEG analyses require >=2 channels classified as EEG.")
    scaling = {"V": 1, "µV": 1e-6, "uV": 1e-6, "mV": 1e-3}
    invalid = [recording.units[i] for i in indices if recording.units[i] not in scaling]
    if invalid:
        raise ValueError("EEG channel units must be V, mV, µV or uV. Correct channel metadata before analysis.")
    names = [recording.names[i] for i in indices]
    data = np.vstack([recording.processed[i] * scaling[recording.units[i]] for i in indices])
    info = mne.create_info(names, recording.sfreq, ch_types="eeg")
    raw = mne.io.RawArray(data, info, verbose="ERROR")
    return raw


def mne_power(recording, start=0, duration=30, fmin=1, fmax=45):
    """MNE Welch PSD on typed EEG channels; returned units are V²/Hz."""
    raw = _mne_eeg(recording)
    fmax = min(float(fmax), recording.sfreq / 2)
    if not 0 <= fmin < fmax:
        raise ValueError("Invalid frequency interval.")
    tmax = min(recording.duration, start + duration)
    if start < 0 or start >= tmax:
        raise ValueError("Selected window is outside recording.")
    cropped = raw.copy().crop(tmin=start, tmax=tmax)
    psd = cropped.compute_psd(method="welch", fmin=fmin, fmax=fmax,
                             n_fft=min(1024, cropped.n_times),
                             n_overlap=min(512, (min(1024, cropped.n_times) - 1) // 2),
                             verbose="ERROR")
    data, freqs = psd.get_data(return_freqs=True)
    return {"channels": list(raw.ch_names), "frequency": freqs.tolist(),
            "power": data.tolist(), "unit": "V²/Hz", "method": "MNE-Python, Welch"}


def mne_epochs(recording, label, tmin=-.2, tmax=.8, baseline_end=0,
               reject_peak_uv=None):
    """MNE Epochs with explicit basic baseline and optional PTP reject criterion."""
    import mne
    raw = _mne_eeg(recording)
    if not tmin < tmax or not tmin <= baseline_end <= tmax:
        raise ValueError("Invalid epoch or baseline window.")
    fs = recording.sfreq
    samples = []
    for ev in recording.events:
        if str(ev["label"]) != label:
            continue
        idx = int(round(float(ev["time"]) * fs))
        if idx >= 0 and idx < raw.n_times:
            samples.append([idx, 0, 1])
    if not samples:
        raise ValueError("No matching events.")
    epochs = mne.Epochs(raw, np.asarray(samples, dtype=int), event_id={"event": 1},
                        tmin=tmin, tmax=tmax,
                        baseline=(tmin, baseline_end) if baseline_end > tmin else None,
                        reject={"eeg": reject_peak_uv * 1e-6} if reject_peak_uv is not None else None,
                        preload=True, verbose="ERROR")
    if len(epochs) == 0:
        raise ValueError("All epochs were excluded.")
    evoked = epochs.average()
    return {"time": evoked.times.tolist(), "channels": evoked.ch_names,
            "average": (evoked.data * 1e6).tolist(), "unit": "µV",
            "n": int(len(epochs)), "requested": len(samples),
            "excluded": len(samples) - len(epochs),
            "baseline": [tmin, baseline_end] if baseline_end > tmin else None,
            "method": "MNE Epochs and Evoked",
            "warning": "Check event latencies, filtering, bad channels and artifact thresholds before publication."}


def head_positions(recording):
    """Standard 10-20 positions for matching channel names; not measured electrode positions."""
    import mne
    montage = mne.channels.make_standard_montage("standard_1020")
    positions = {key.lower(): val for key, val in montage.get_positions()["ch_pos"].items()}
    channels = []
    for name, kind in zip(recording.names, recording.types):
        value = positions.get(name.lower())
        if value is None or kind != "eeg":
            continue
        channels.append({"name": name, "x": float(value[0] / .11),
                         "y": float(value[1] / .11), "z": float(value[2] / .11)})
    return {"channels": channels, "montage": "standard_1020",
            "warning": "Template locations are approximate; actual electrode positions were not digitized."}


def ica_preview(recording, n_components=10, max_seconds=120):
    """Exploratory ICA decomposition, without automated component rejection."""
    import mne
    from mne.preprocessing import ICA
    raw = _mne_eeg(recording)
    if raw.info["nchan"] > 64:
        raise ValueError("ICA preview currently supports at most 64 EEG channels.")
    if raw.n_times < int(raw.info["sfreq"] * 10):
        raise ValueError("ICA preview requires at least 10 seconds.")
    if raw.info["sfreq"] * max_seconds < raw.n_times:
        raw.crop(tmax=float(max_seconds))
    raw.filter(l_freq=1.0, h_freq=None, verbose="ERROR")
    maximum = min(int(n_components), raw.info["nchan"] - 1)
    if maximum < 2:
        raise ValueError("Too few independent EEG channels.")
    ica = ICA(n_components=maximum, method="fastica", random_state=19,
              max_iter=500, verbose="ERROR")
    ica.fit(raw, verbose="ERROR")
    fractions = ica.get_explained_variance_ratio(raw, components=list(range(ica.n_components_)))
    fractions = {str(key): float(value) for key, value in fractions.items()}
    return {"component_count": int(ica.n_components_), "explained_variance_ratio": fractions,
            "excluded": [], "method": "MNE FastICA on temporary 1 Hz high-pass copy",
            "warning": "No components were automatically removed. Visual inspection and a validated artifact protocol are essential."}


def nk_hrv(recording, channel):
    """HRV metrics based on detected ECG peaks. Requires sufficiently long and clean signal."""
    import neurokit2 as nk
    if channel not in recording.names:
        raise ValueError("Unknown channel.")
    data = recording.processed[recording.names.index(channel)]
    if data.size < recording.sfreq * 30:
        raise ValueError("HRV needs at least 30 s of ECG; longer recordings are often required for frequency-domain HRV.")
    cleaned = nk.ecg_clean(data, sampling_rate=recording.sfreq)
    _, peaks = nk.ecg_peaks(cleaned, sampling_rate=recording.sfreq, correct_artifacts=True)
    features = nk.hrv(peaks, sampling_rate=recording.sfreq, show=False)
    result = {}
    for col in features.columns:
        value = float(features.iloc[0][col])
        result[col] = value if np.isfinite(value) else None
    return {"channel": channel, "features": result,
            "r_peaks": list(map(int, peaks.get("ECG_R_Peaks", []))),
            "method": "NeuroKit2 ECG cleaning, peak detection and HRV",
            "warning": "Validate R-peak detections, ectopic beats, signal duration and stationary assumptions."}
