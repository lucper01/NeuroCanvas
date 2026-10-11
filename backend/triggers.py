"""Trigger-code detection, condition mapping and condition-aligned epoch extraction.

Detection never mutates the acquisition. The caller explicitly commits accepted
events. Code labels and groupings are metadata, never edits to the signal.
"""
from __future__ import annotations
from collections import Counter
import numpy as np

MAX_DETECTED = 50_000
MAX_EPOCH_VALUES = 2_000_000


def code_of(event):
    if isinstance(event.get("code"), int):
        return int(event["code"])
    try:
        value = float(str(event["label"]).strip())
        if np.isfinite(value) and int(value) == value and value > 0:
            return int(value)
    except (ValueError, TypeError, KeyError):
        pass
    return None


def map_trigger(event, definitions):
    code = code_of(event)
    candidates = [definition for definition in definitions if definition["code"] == code]
    mapping = candidates[0] if candidates else None
    return {
        **event,
        "code": code,
        "meaning": mapping["meaning"] if mapping else str(event.get("label", "")),
        "conditions": list(mapping["conditions"]) if mapping else [],
    }


def detect_triggers(rec, channel, min_width_ms=0., min_interval_ms=0., tolerance=.25, bit_mask=None):
    """Extract integer-coded nonzero TTL states, accepting stable plateaus only.

    A change from one nonzero code to another creates a new event. Unstable
    transitions are rejected. Sampling time is the onset of the stable run.
    """
    if channel not in rec.names:
        raise ValueError("Trigger channel not found.")
    if not 0 <= min_width_ms <= 1000 or not 0 <= min_interval_ms <= 5000:
        raise ValueError("Pulse width and minimum interval must be within allowed bounds.")
    if not 0 <= tolerance <= .49:
        raise ValueError("Tolerance must be within 0 and 0.49 integer units.")
    if bit_mask is not None and (not isinstance(bit_mask, int) or bit_mask <= 0 or bit_mask > 16_777_215):
        raise ValueError("Invalid bit mask.")
    samples = rec.original[rec.names.index(channel)]
    rounded = np.rint(samples)
    matches = np.isfinite(samples) & (np.abs(samples - rounded) <= tolerance)
    matches &= (rounded > 0) & (rounded < 2 ** 24)
    codes = np.where(matches, rounded, 0).astype(np.int64)
    if bit_mask is not None:
        codes &= bit_mask
    edges = np.r_[0, np.flatnonzero(np.diff(codes) != 0) + 1, len(codes)]
    min_width = max(1, int(np.ceil(min_width_ms * rec.sfreq / 1000.)))
    min_distance = int(np.ceil(min_interval_ms * rec.sfreq / 1000.))
    detected = []
    previous_onset = None
    short_rejected = 0
    interval_rejected = 0
    for start, stop in zip(edges[:-1], edges[1:]):
        value = int(codes[start])
        if value == 0:
            continue
        if stop - start < min_width:
            short_rejected += 1
            continue
        if previous_onset is not None and start - previous_onset < min_distance:
            interval_rejected += 1
            continue
        if len(detected) >= MAX_DETECTED:
            raise ValueError("More than 50,000 triggers detected: select a suitable stim channel.")
        detected.append({
            "time": round(start / rec.sfreq, 9),
            "duration": round((stop - start) / rec.sfreq, 9),
            "label": str(value),
            "code": value,
            "source": "detected:" + channel,
        })
        previous_onset = start
    return {"events": [map_trigger(e, rec.trigger_definitions) for e in detected],
            "counts": dict(sorted(Counter(str(e["code"]) for e in detected).items())),
            "short_rejected": short_rejected,
            "interval_rejected": interval_rejected,
            "source_channel": channel,
            "bit_mask": bit_mask,
            "sampling_rate": rec.sfreq,
            "note": "Preview only; confirm before committing triggers. Raw samples remain untouched."}


def validate_definitions(definitions):
    if len(definitions) > 2000:
        raise ValueError("Maximum 2,000 trigger definitions.")
    used = set()
    result = []
    for item in definitions:
        code = item["code"]
        meaning = item["meaning"].strip()
        conditions = [c.strip() for c in item["conditions"]]
        if not isinstance(code, int) or isinstance(code, bool) or code <= 0 or code > 16_777_215:
            raise ValueError("Trigger codes must be positive integers up to 2^24-1.")
        if code in used:
            raise ValueError("Duplicate trigger definition: " + str(code))
        if not meaning or len(meaning) > 180:
            raise ValueError("Provide a meaning of at most 180 characters.")
        if len(conditions) > 16 or any(not x or len(x) > 100 for x in conditions):
            raise ValueError("Invalid trigger condition.")
        if len(set(conditions)) != len(conditions):
            raise ValueError("Repeated condition for a trigger.")
        used.add(code)
        result.append({"code": code, "meaning": meaning, "conditions": conditions})
    return sorted(result, key=lambda x: x["code"])


def commit_detected(rec, detected):
    """Replace only earlier detected events from the same channel.

    Matching imported stim-channel events are deduplicated when they have the
    same code and sample onset. Other events are retained.
    """
    channel = detected["source_channel"]
    source = "detected:" + channel
    keep = [e for e in rec.events if e.get("source") != source]
    new = []
    for event in detected["events"]:
        code = int(event["code"])
        sample = int(round(float(event["time"]) * rec.sfreq))
        if any(code_of(earlier) == code and
               abs(round(float(earlier["time"]) * rec.sfreq) - sample) <= 1
               for earlier in keep):
            continue
        new.append({k: event[k] for k in ("time", "duration", "label", "code", "source")})
    rec.events = sorted(keep + new, key=lambda e: float(e["time"]))
    return {"committed": len(new), "skipped_existing": len(detected["events"]) - len(new),
            "events": len(rec.events), "source_channel": channel}


def condition_epochs(rec, channel, condition, tmin=-.2, tmax=.8, baseline_end=0.,
                     exclude_marked=False, max_trials=200, exclude_rejected=False, trial_offset=0):
    if channel not in rec.names:
        raise ValueError("Unknown channel.")
    if not isinstance(trial_offset, int) or trial_offset < 0 or not 0 <= max_trials <= 200:
        raise ValueError("Invalid trial page; limit must be 0–200.")
    if not np.isfinite(tmin) or not np.isfinite(tmax) or tmin >= tmax:
        raise ValueError("Epoch window must have tmin < tmax.")
    if not np.isfinite(baseline_end) or not tmin <= baseline_end <= tmax:
        raise ValueError("Invalid baseline_end.")
    start = int(round(tmin * rec.sfreq))
    end = int(round(tmax * rec.sfreq))
    points = end - start + 1
    if not 16 <= points <= 20_000:
        raise ValueError("Epoch must contain 16 to 20,000 samples.")
    if exclude_marked and channel in rec.bad_channels:
        raise ValueError("Selected channel is marked bad.")
    times = np.arange(start, end + 1) / rec.sfreq
    base = (times >= tmin) & (times <= baseline_end)
    from review import event_uid, get_decision
    selected = []
    excluded_bounds = 0
    excluded_manual = 0
    excluded_rejected = 0
    for event in rec.events:
        mapped = map_trigger(event, rec.trigger_definitions)
        if condition and condition not in mapped["conditions"]:
            continue
        event_sample = int(round(float(event["time"]) * rec.sfreq))
        first = event_sample + start
        last = event_sample + end + 1
        if first < 0 or last > rec.original.shape[1]:
            excluded_bounds += 1
            continue
        if exclude_marked and any(
            mark["start"] < last / rec.sfreq and mark["end"] > first / rec.sfreq
            for mark in rec.bad_segments
        ):
            excluded_manual += 1
            continue
        decision = get_decision(rec, event)
        if exclude_rejected and decision and decision["rejected"]:
            excluded_rejected += 1
            continue
        epoch = rec.processed[rec.names.index(channel), first:last].copy()
        if baseline_end > tmin and np.any(base):
            epoch -= epoch[base].mean()
        selected.append((mapped, epoch, event_uid(rec, event), decision))
        if len(selected) * points > MAX_EPOCH_VALUES:
            raise ValueError("Too many selected epoch samples. Narrow the interval or filter conditions.")
    if not selected:
        raise ValueError("No valid epochs for this condition and time range.")
    data = np.vstack([epoch for _, epoch, _, _ in selected])
    mean = np.mean(data, axis=0)
    sem = np.std(data, ddof=1, axis=0) / np.sqrt(len(data)) if len(data) > 1 else None
    # Limit the number of single-trial traces returned to keep the UI responsive.
    stride = max(1, int(np.ceil(points * min(len(selected), max_trials) / 100_000)))
    output_trials = [{
        "event_index": i, "event_uid": uid,
        "time": mapped["time"], "code": mapped["code"],
        "meaning": mapped["meaning"], "conditions": mapped["conditions"],
        "review_rejected": bool(decision and decision["rejected"]),
        "review_reason": decision["reason"] if decision else "",
        "rms": float(np.sqrt(np.mean(epoch**2))),
        "ptp": float(np.ptp(epoch)),
        "mean_amplitude": float(np.mean(epoch)),
        "signal": epoch[::stride].tolist()
    } for i, (mapped, epoch, uid, decision) in
          enumerate(selected[trial_offset: trial_offset + max_trials], start=trial_offset)]
    return {
        "condition": condition, "channel": channel, "n": len(selected),
        "excluded_bounds": excluded_bounds, "excluded_manual": excluded_manual,
        "excluded_rejected": excluded_rejected,
        "codes": dict(sorted(Counter(str(mapped["code"]) for mapped, _, _, _ in selected).items())),
        "trial_offset": trial_offset, "trial_limit": max_trials,
        "next_offset": trial_offset + max_trials if max_trials and
                       trial_offset + max_trials < len(selected) else None,
        "time": times.tolist(), "mean": mean.tolist(),
        "sem": sem.tolist() if sem is not None else None,
        "trial_time": times[::stride].tolist(), "trials": output_trials,
        "unit": rec.units[rec.names.index(channel)],
        "baseline": [tmin, baseline_end] if baseline_end > tmin else None,
        "exclude_marked": bool(exclude_marked),
        "exclude_rejected": bool(exclude_rejected),
    }



def epoch_rows(rec, channel, condition, tmin, tmax, baseline_end, exclude_marked,
               exclude_rejected=False):
    """Yield one row per full-resolution epoch sample for scientific CSV export."""
    if channel not in rec.names:
        raise ValueError("Unknown channel.")
    lo = int(round(tmin * rec.sfreq))
    hi = int(round(tmax * rec.sfreq)) + 1
    times = np.arange(lo, hi, dtype=float) / rec.sfreq
    mask = (times >= tmin) & (times <= baseline_end)
    accepted = 0
    signal_row = rec.processed[rec.names.index(channel)]
    from review import event_uid, get_decision
    for ev in rec.events:
        mapped = map_trigger(ev, rec.trigger_definitions)
        if condition and condition not in mapped["conditions"]:
            continue
        onset = int(round(ev["time"] * rec.sfreq))
        a, b = onset + lo, onset + hi
        if a < 0 or b > len(signal_row):
            continue
        if exclude_marked and (channel in rec.bad_channels or any(
            seg["start"] < b / rec.sfreq and seg["end"] > a / rec.sfreq
            for seg in rec.bad_segments
        )):
            continue
        decision = get_decision(rec, ev)
        if exclude_rejected and decision and decision["rejected"]:
            continue
        epoch = signal_row[a:b].copy()
        if baseline_end > tmin and np.any(mask):
            epoch -= epoch[mask].mean()
        accepted += 1
        for offset, value in zip(times, epoch):
            yield [accepted, "|".join(mapped["conditions"]), mapped["code"] or "",
                   mapped["meaning"], ev["time"], round(float(offset), 9),
                   float(value), rec.units[rec.names.index(channel)],
                   event_uid(rec, ev), bool(decision and decision["rejected"]),
                   decision["reason"] if decision else ""]



def multichannel_epochs_npz(rec, condition, tmin=-.2, tmax=.8,
                           baseline_end=0., exclude_marked=False, exclude_rejected=False):
    """Package event-aligned, multi-channel data into an NPZ.

    Shape: (trials, channels, timepoints); records input units without scaling.
    This function never alters raw or processed input arrays.
    """
    import io
    import json

    fs = rec.sfreq
    if not np.isfinite(tmin) or not np.isfinite(tmax) or tmin >= tmax:
        raise ValueError("Invalid epoch window.")
    if not tmin <= baseline_end <= tmax:
        raise ValueError("Baseline limit is outside selected epoch.")
    first, last = int(round(tmin * fs)), int(round(tmax * fs))
    n_time = last - first + 1
    if not 16 <= n_time <= 20000:
        raise ValueError("Epoch duration must be between 16 and 20,000 samples.")
    picks = [i for i, typ in enumerate(rec.types)
             if typ != "stim" and (not exclude_marked or rec.names[i] not in rec.bad_channels)]
    if not picks:
        raise ValueError("No physiological channels available for export.")
    rows = []
    trigger_labels = []
    rejected_bounds = 0
    rejected_marks = 0
    from review import event_uid, get_decision
    rejected_trials = 0
    time = np.arange(first, last + 1, dtype=float) / fs
    base = (time >= tmin) & (time <= baseline_end)
    for ev in rec.events:
        mapped = map_trigger(ev, rec.trigger_definitions)
        if condition and condition not in mapped["conditions"]:
            continue
        center = int(round(ev["time"] * fs))
        a, b = center + first, center + last + 1
        if a < 0 or b > rec.original.shape[1]:
            rejected_bounds += 1
            continue
        if exclude_marked and any(
            seg["start"] < b / fs and seg["end"] > a / fs for seg in rec.bad_segments
        ):
            rejected_marks += 1
            continue
        decision = get_decision(rec, ev)
        if exclude_rejected and decision and decision["rejected"]:
            rejected_trials += 1
            continue
        if (len(rows) + 1) * len(picks) * n_time > 10_000_000:
            raise ValueError("NPZ export limited to 10 million values; shorten the window or choose a condition.")
        epoch = rec.processed[picks, a:b].copy()
        if baseline_end > tmin and base.any():
            epoch -= np.mean(epoch[:, base], axis=1, keepdims=True)
        rows.append(epoch)
        trigger_labels.append({
            "event_uid": event_uid(rec, ev),
            "onset_s": mapped["time"], "code": mapped["code"],
            "meaning": mapped["meaning"], "conditions": mapped["conditions"],
            "review_rejected": bool(decision and decision["rejected"]),
            "review_reason": decision["reason"] if decision else "",
        })
    if not rows:
        raise ValueError("No valid epochs for this condition.")
    blob = io.BytesIO()
    metadata = {
        "recording": rec.name, "sfreq": fs,
        "channels": [rec.names[i] for i in picks],
        "types": [rec.types[i] for i in picks],
        "units": [rec.units[i] for i in picks],
        "shape": [len(rows), len(picks), n_time],
        "condition": condition, "epochs": trigger_labels,
        "excluded_bounds": rejected_bounds,
        "excluded_manual": rejected_marks,
        "excluded_rejected": rejected_trials,
        "exclude_marked": bool(exclude_marked),
        "exclude_rejected": bool(exclude_rejected),
        "trial_decisions": list(rec.trial_decisions),
        "baseline": [tmin, baseline_end] if baseline_end > tmin else None,
        "history": rec.steps, "trigger_definitions": rec.trigger_definitions,
        "note": "Non-diagnostic output; input channel units preserved.",
    }
    np.savez_compressed(blob, epochs=np.stack(rows), times_s=time,
                        metadata_json=np.asarray(json.dumps(metadata, ensure_ascii=False)))
    blob.seek(0)
    return blob
