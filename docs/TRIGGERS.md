# Trigger & Epoch Studio

This module converts event codes in acquisition channels and manually imported event markers into reproducible **event tables**, **trigger dictionaries**, **experimental conditions**, and **event-aligned epochs**.

## Detection

1. Import a recording containing a digital status/stim/trigger channel (e.g. BioSemi Status or STI 014).
2. Open **Trigger & Epoch Studio**, select the raw trigger channel.
3. Choose an optional bit mask (8-bit `0xFF`, 16-bit `0xFFFF`, or 24-bit `0xFFFFFF`). Use this for status words containing extra non-trigger bits. Do not apply a mask without checking the hardware manual.
4. Adjust **minimum pulse width**, **minimum interval**, and integer-code **tolerance**. The preview shows code counts, timestamps, and rejected pulses.
5. Confirm only after visually checking the preview; confirmation adds event metadata while preserving raw samples.

### Algorithm and limitations

- Positive integer values and stable nonzero runs are interpreted as event codes.
- Each transition from 0 to nonzero, or one positive code to a different positive code, is a candidate onset.
- A run shorter than the minimum configured pulse width is rejected. A candidate closer than the configured minimum interval to the last accepted onset is rejected.
- Event onset is the first sample of the valid run: onset seconds = sample index / recorded Fs.
- A bit mask is applied to the validated integer status word before run segmentation.
- Previously detected events from the same channel are replaced on reconfirmation. Identical imported events (matching code and onset within one sample) are not duplicated.
- Other annotation sources are retained. The UI does not resample or time-shift the signal.
- Code detection assumes *level-coded integer status samples*, not arbitrary analog threshold crossings or variable-length serial protocols. For analog TTL with voltage levels, first calibrate/convert to a discrete event channel externally.
- BioSemi/BDF and other EEG formats may already have events decoded by MNE. Compare automatic MNE events to these detected status onsets before deciding whether to confirm.

## Trigger dictionary

Each positive integer code receives:
- A meaning/description, e.g. `11 = Visual standard`, `12 = Visual deviant`.
- Zero or more **condition names**, e.g. `11 → [Visual, Standard]`, `12 → [Visual]`, `21 → [Auditory, Standard]`.
- One **condition may contain several distinct codes**, and a code can participate in multiple condition sets.

Definitions are validated for unique code identifiers and exported as JSON. The UI can select multiple trigger codes and assign them to one named condition at once. Meanings, codes and condition names remain unchanged in exports regardless of the language selected for interface labels.

## Event and epoch exports

The event table contains onset (s), duration (s), sample index, code, raw label, meaning, condition membership, and source.

The epoch controls select a physiological channel, condition, time limits relative to trigger onset (e.g., -0.2 to +0.8 s), baseline end and optional exclusion of manually annotated artifact periods. The output provides:
- Per-condition grand average, optional SEM and individual trial preview.
- Number of accepted epochs, boundary exclusions and manual exclusions.
- Counts of original trigger codes contributing to the condition.
- Full-resolution long-form CSV with trial index, condition membership, code, meaning, onset, relative time, amplitude and declared unit (with bounded export sizes).

**The source acquisition is never overwritten by event detection, code grouping or trial segmentation.**

## Reproducibility controls

- Archive the original signal file, the trigger dictionary JSON, the event list CSV, quality review JSON, the epoch data CSV and the processing-provenance JSON together.
- Record trigger output latency and hardware synchronization independently; software sample indices do not correct unmeasured hardware delays.
- Verify that each code maps to exactly the intended stimuli and that multiple code values do not encode unrelated factors.
- Confirm channel units, sample rate, baseline, artifact exclusions and temporal alignment before reporting ERPs or publishing derived figures.
- Keep separate individual-condition analyses and pooled-condition analyses when pooling codes could hide scientifically meaningful within-condition variation.

## French / English

The interface supports **Automatic**, **Français** and **English** in the Personalization menu. Automatic chooses French for browser locales beginning with `fr`, otherwise English. The selected override is stored locally on the device. Recorded signal values, trigger codes, user-defined condition labels and scientific units are never machine-translated.
