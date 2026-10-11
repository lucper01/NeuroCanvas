import numpy as np
import pytest
from engine import Recording, apply_pipeline, viewport, power_spectrum, evoked


def recording():
    fs = 200
    x = np.arange(fs * 10) / fs
    return Recording("test", np.stack([
        np.sin(2 * np.pi * 10 * x) + .2 * np.sin(2 * np.pi * 50 * x),
        np.sin(2 * np.pi * 6 * x)
    ]), fs, ["Cz", "Pz"], ["eeg", "eeg"], ["V", "V"], "test",
    events=[{"time": 3., "duration": 0, "label": "1"}])


def test_filter_is_nondestructive():
    r = recording()
    untouched = r.original.copy()
    apply_pipeline(r, [{"method": "filter", "low": 8, "high": 12}])
    assert np.array_equal(r.original, untouched)
    assert not np.array_equal(r.original, r.processed)
    apply_pipeline(r, [])
    assert np.array_equal(r.original, r.processed)


def test_decimation_preserves_extrema():
    r = recording()
    result = viewport(r, ["Cz"], 0, 10, 200)
    assert len(result["traces"][0]["x"]) <= 200
    assert max(result["traces"][0]["y"]) > 1


def test_psd_peak():
    r = recording()
    spec = power_spectrum(r, "Cz")
    assert abs(spec["frequency"][int(np.argmax(spec["psd"]))] - 10) < .25


def test_erp():
    r = recording()
    result = evoked(r, "Cz", "1")
    assert result["n"] == 1
    assert len(result["time"]) == len(result["mean"])


def test_invalid_cutoff():
    r = recording()
    with pytest.raises(ValueError):
        apply_pipeline(r, [{"method": "filter", "high": 150}])
