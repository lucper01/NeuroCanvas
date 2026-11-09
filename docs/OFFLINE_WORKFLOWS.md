# NeuroCanvas v0.6 | Offline research workflows

## Principles

NeuroCanvas is an **offline-first** scientific PWA. The following features do
not upload acquisitions and require no cloud account, hosting service or backend
service. Browser imports preserve original data, and analysis decisions never
modify the source file. Optional **local** Python (MNE, NeuroKit2 and SciPy)
remains available for advanced analyses and additional formats.

The web app is not a medical device. Quality-control flags are descriptive
review prompts, not validated diagnoses or automatic rejection decisions.

## 1. Batch Inventory

1. Open **Batch Inventory** and choose up to 150 files.
2. Include the `.vhdr`, `.eeg` and `.vmrk` companion files together for
   BrainVision datasets.
3. Inspect the channel count, sample rate, duration and file warnings, where
   the header reliably provides them.
4. Export a CSV or JSON inventory. Filename redaction is enabled by default.
5. Use **Load** for an acquisition to open it in Signal Explorer.

The scanner reads only a small header range. It **does not** inspect raw
waveforms, infer physiology, or calculate signal quality. For CSV/TSV,
sampling frequency, recording length and duration remain unspecified until
the complete file is imported with a verified time axis or known sampling
rate. FIF, SET and ACQ are marked as requiring Python.

EDF/BDF header scans verify declared byte lengths and record counts. For
EDF+/BDF+ with discontinuous timing or channels with different sampling
rates, the inventory reports a limitation rather than silently constructing
a uniform time axis.

## 2. Multichannel Quality Matrix

1. Import an acquisition or use the synthetic demonstration.
2. Open **Artifact Review**.
3. Select the QC window length (0.2 to 60 seconds).
4. Click **Scan all channels**.
5. Examine the time-by-channel map and the full per-channel breakdown.
6. Use **Inspect** to focus on a specific channel and suspect window.
7. Export CSV for **every** examined window.

Flags use comparisons within the same channel:

- High amplitude: peak-to-peak amplitude above the channel-specific
  median + 8 × 1.4826 × median absolute deviation. A special rule handles
  zero median absolute deviation.
- Flat signal: peak-to-peak amplitude below 0.001 × the channel-specific
  peak-to-peak median.
- Manual: intersects an existing manually marked artifact interval.

The matrix is a **screening heuristic**, not an amplitude threshold in µV,
mV or another physiological unit. A red/orange/other colored cell does
not mean a patient is abnormal or that the segment must be excluded.

For performance, the display may **aggregate adjacent windows**; the
exported CSV preserves all individual windows and all calculated indicators.
Manual flags take display precedence but do not erase other flags.
No rejection is automatic.

The implementation shares its QC definitions with the existing
single-channel view and remains compatible with the optional local Python
engine. The original samples are never overwritten.

## 3. Processing Recipe Studio

1. In Signal Processing, select signal channels and configure steps.
2. Export the processing method as a **versioned recipe JSON**, without
   including any signal samples.
3. On a new recording, import the recipe.
4. Inspect the method, filters, target channels and warnings.
5. Explicitly select **Apply this recipe** if appropriate.

The recipe validator rejects:

- Unknown processing operations
- Missing or duplicate channel names
- Filter cutoffs outside (0, Nyquist) or incorrectly ordered high/low
- Invalid notch frequency or Q
- Applying a filter to digital TTL/status channels
- Average EEG reference with fewer than two EEG channels

Sample rate or unit differences between the saved recipe and the active
recording produce warnings. A valid recipe is **not** a validated analysis
method: inspect measurement units, phase behavior, transition bands,
artifact sensitivity and sampling assumptions before publication.

The browser pipeline is exploratory. The optional local Python backend
implements more rigorous SciPy filtering; the same saved recipe can be
reviewed against either engine's active channel names.

## 4. Scientific Audit

In Export & Reproducibility, generate:

- `neurocanvas_scientific_audit.html` - standalone, print-ready HTML
  with no linked JS or remote services. Open it locally and use the
  browser's print-to-PDF function if a PDF is required.
- `neurocanvas_scientific_audit.json` - machine-readable versioned
  descriptive report suitable for further processing.

Each report records the available acquisition metadata, channels and
units, timestamp, processing steps, event label/code counts, QC window
counts, manual exclusions and import/analysis warnings.

Reports do **not** include raw or processed sample matrices. Filename
redaction is selected by default, but **not** a claim of full anonymization:
event labels, file-derived metadata and reviewer comments can still
contain identifying information. Inspect the output before sharing,
especially when processing human-subject recordings.

QC is freshly computed when the report is generated; a selected-channel
or stale previous scan is not reused. Failures to calculate QC are
reported as errors rather than silently presenting a complete-looking
report without quality results.

## 5. International use and validation

The user interface supports French and English, including the QC map,
batch inventory and reporting workflow. Report HTML has a language
attribute and escaped strings to avoid executing metadata that may
originate from a recording or comment.

Unit tests cover:

- EDF/BDF and BrainVision metadata and partial/incompatible cases
- No guessing of CSV Fs or timing
- Privacy-aware exports and spreadsheet-formula escaping
- Multichannel QC flags and full-window exports
- Saved recipe validation and TTL-protection
- Escaped HTML report generation without raw signal arrays

Playwright browser tests cover interactions in desktop and mobile
layouts. Neither automated test success nor matching synthetic examples
establishes independent scientific validation for a new modality.

## Future scientific priorities

Validate selected outputs against fixed reference datasets in MNE,
SciPy and NeuroKit2; implement explicit sensor calibration and units;
add data-aware time-frequency methods; improve low-memory progressive
BDF and EDF inspection; extend event synchronization QC and timing-drift
audits; and offer optional desktop packaging for institutions needing
fully local Python without manual setup.
