import numpy as np
import pytest

from engine import Recording, load_recording
from advanced import quality_report, fft_amplitude, coherence_report


def simulated():
    fs = 250
    times = np.arange(fs * 15) / fs
    eeg1 = 12e-6 * np.sin(2 * np.pi * 10 * times)
    eeg2 = 9e-6 * np.sin(2 * np.pi * 10 * times + .1)
    return Recording("synthetic", np.vstack([eeg1, eeg2]), fs,
                     ["Fz", "Cz"], ["eeg", "eeg"], ["V", "V"], "synthetic")


def test_descriptive_quality():
    r = simulated()
    report = quality_report(r)
    assert report["samples"] == 3750
    assert len(report["channels"]) == 2
    assert report["channels"][0]["ptp"] > 0
    assert report["channels"][0]["near_constant"] is False


def test_amplitude_peak_and_scale():
    r = simulated()
    fft = fft_amplitude(r, "Fz", 0, 8)
    idx = int(np.argmax(fft["amplitude"]))
    assert abs(fft["frequency"][idx] - 10) <= .2
    assert abs(fft["amplitude"][idx] - 12e-6) < 1.5e-6


def test_coherence_bounds_and_association():
    r = simulated()
    coh = coherence_report(r, "Fz", "Cz", 0, 12)
    assert 0 <= min(coh["coherence"])
    assert max(coh["coherence"]) <= 1.00001
    k = np.argmin(abs(np.array(coh["frequency"]) - 10))
    assert coh["coherence"][int(k)] > .95


def test_csv_sampling_and_decimal(tmp_path):
    filename = tmp_path / "signals.csv"
    filename.write_text("time_s;EEG\n0,000;1,5\n0,004;2,5\n0,008;3,5\n0,012;4,5\n")
    data = load_recording(filename, None, tmp_path)
    assert data.sfreq == pytest.approx(250)
    assert data.original[0, 0] == pytest.approx(1.5)


def test_csv_irregular_times_rejected(tmp_path):
    filename = tmp_path / "broken.csv"
    filename.write_text("time_s,EEG\n0,1\n0.004,2\n0.011,3\n0.012,4\n")
    with pytest.raises(ValueError, match="uniformly sampled"):
        load_recording(filename, 250, tmp_path)


def test_mne_evoked_and_montage():
    pytest.importorskip("mne")
    from advanced import mne_epochs, head_positions
    r = simulated()
    r.events = [{"time": 5.0, "label": "A", "duration": 0},
                {"time": 8.0, "label": "A", "duration": 0}]
    result = mne_epochs(r, "A")
    assert result["n"] == 2
    assert len(result["channels"]) == 2
    montage = head_positions(r)
    assert len(montage["channels"]) == 2
