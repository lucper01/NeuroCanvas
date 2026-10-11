"""Research-grade, explicit single-trial curation and descriptive condition reports.

The review log is metadata. Raw data and derived signals are never changed here.
"""
from __future__ import annotations

from collections import Counter
from hashlib import sha256
import math
import numpy as np


def event_uid(recording, event):
    """Stable identity tied to a specific event's acquisition origin.

    An explicit uid takes priority. For legacy imports, a deterministic digest
    of source, sample, code and original label avoids reliance on list ordering.
    """
    if event.get("uid"):
        return str(event["uid"])
    from triggers import code_of
    sample = int(round(float(event["time"]) * recording.sfreq))
    key = f'{recording.name}|{event.get("source","")}|{sample}|{code_of(event)}|{event.get("label","")}'
    return sha256(key.encode("utf-8")).hexdigest()[:24]


def get_decision(recording, event):
    key = event_uid(recording, event)
    return next((dict(d) for d in recording.trial_decisions if d["event_uid"] == key), None)


def set_decision(recording, event_id, rejected, reason=""):
    """A reviewed rejection requires an explicit reason; acceptance deletes it."""
    if not isinstance(event_id, str) or len(event_id) > 120:
        raise ValueError("Invalid event identifier.")
    valid = {event_uid(recording, event) for event in recording.events}
    if event_id not in valid:
        raise ValueError("Unknown event. Recompute trials after importing or detecting events.")
    if rejected and (not isinstance(reason, str) or not 2 <= len(reason.strip()) <= 180):
        raise ValueError("A rejection reason of 2–180 characters is required.")
    recording.trial_decisions = [d for d in recording.trial_decisions if d["event_uid"] != event_id]
    if rejected:
        recording.trial_decisions.append({
            "event_uid": event_id,
            "rejected": True,
            "reason": reason.strip(),
        })
    return {
        "event_uid": event_id, "rejected": bool(rejected),
        "reviewed_count": len(recording.trial_decisions),
    }


def decisions_export(recording):
    lookup = {event_uid(recording, ev): ev for ev in recording.events}
    rows = []
    for item in recording.trial_decisions:
        event = lookup.get(item["event_uid"])
        rows.append({
            **item,
            "event_present": event is not None,
            "onset_s": float(event["time"]) if event else None,
            "code": __import__("triggers").code_of(event) if event else None,
            "source": event.get("source", "manual") if event else None,
        })
    return {"recording": recording.name, "sfreq": recording.sfreq,
            "reviewed": rows, "retained_raw": True,
            "warning": "Manual trial decisions only; no raw samples were deleted."}


def condition_metrics(recording, channel, tmin=-.2, tmax=.8,
                      measure_start=0., measure_end=.3,
                      baseline_end=0., exclude_marked=False,
                      exclude_rejected=False):
    """Descriptive condition-level measurements from properly epoched signals.

    Outputs are *descriptive* and must not be interpreted as inferential tests.
    The selected measurement interval is inclusive and is applied to each
    condition's mean and individual trial arrays.
    """
    from triggers import condition_epochs
    if not (all(math.isfinite(x) for x in (
            tmin, tmax, measure_start, measure_end, baseline_end)) and
            tmin < tmax and tmin <= measure_start < measure_end <= tmax):
        raise ValueError("Measurement window must be inside the selected epoch.")
    conditions = sorted({
        name for item in recording.trigger_definitions for name in item["conditions"]
    })
    if len(conditions) > 100:
        raise ValueError("Maximum 100 conditions in a comparative report.")
    output = []
    for condition in conditions:
        try:
            epoch = condition_epochs(
                recording, channel, condition, tmin, tmax, baseline_end,
                exclude_marked, max_trials=0, exclude_rejected=exclude_rejected,
            )
        except ValueError as exc:
            if "No valid epochs" in str(exc):
                output.append({"condition": condition, "n": 0, "status": "no_valid_trials"})
                continue
            raise
        times = np.asarray(epoch["time"], dtype=float)
        values = np.asarray(epoch["mean"], dtype=float)
        selection = (times >= measure_start - 1e-9) & (times <= measure_end + 1e-9)
        if not np.any(selection):
            raise ValueError("Measurement window contains no samples.")
        sub = values[selection]
        t = times[selection]
        peak_index = int(np.argmax(np.abs(sub)))
        area = float(np.trapezoid(sub, t)) if len(t) > 1 else 0.0
        output.append({
            "condition": condition,
            "status": "ok",
            "n": epoch["n"],
            "codes": epoch["codes"],
            "excluded_bounds": epoch["excluded_bounds"],
            "excluded_manual": epoch["excluded_manual"],
            "excluded_rejected": epoch["excluded_rejected"],
            "mean_amplitude": float(np.mean(sub)),
            "peak_amplitude": float(sub[peak_index]),
            "peak_latency_s": float(t[peak_index]),
            "auc": area,
            "unit": epoch["unit"],
        })
    return {
        "channel": channel, "tmin": tmin, "tmax": tmax,
        "baseline_end": baseline_end,
        "measurement_window": [measure_start, measure_end],
        "exclude_marked": bool(exclude_marked),
        "exclude_rejected": bool(exclude_rejected),
        "conditions": output,
        "warning": "Descriptive means, peak amplitudes and signed AUC. No inferential statistics.",
    }
