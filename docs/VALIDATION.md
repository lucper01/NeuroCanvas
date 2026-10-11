# Scientific validation and quality-control protocol

NeuroCanvas is research software under active development. A successful build and passing unit tests **do not establish analytical validity or clinical safety**. Before using any output in a manuscript, perform at least the following controls.

## 1. Acquisition and metadata

- Confirm recording identity, subject/session mapping, complete file capture and total sample count.
- Verify nominal and, where possible, measured sampling frequency; inspect clock drift and hardware triggers.
- Verify channel mapping, physical units and device gain. Do not change a metadata label in place of genuine numeric calibration.
- Confirm stimulus event offsets and their synchronization with acquisition time.
- Confirm no sample loss, dropout, saturation or unexpected interpolation.

## 2. Signals and filters

- Verify high-pass/low-pass cutoff relative to Nyquist and intended physiology.
- Confirm phase response, transient behavior and edge effects using sinusoids, impulses and step signals.
- Compare filtered signals to reference SciPy/MNE implementations.
- For ERP analyses, inspect baseline duration, event alignment, bad-channel treatment and trial-level artifact rejection.
- For EEG average referencing, verify that only EEG channels were included and the number of good electrodes is adequate.

## 3. Frequency methods

- Compare peak frequencies to known sine waves (e.g., 10 Hz and 20 Hz).
- Check Welch density normalization and integration against known simulated variance (Parseval-type checks).
- Confirm FFT amplitude units versus Welch PSD units (unit squared per hertz).
- Vary recording length, FFT/window length, overlap and taper to characterize spectral resolution and leakage.
- Validate time-frequency outputs with chirps and transient bursts.
- Do not equate band power with cognitive processing without an appropriate experimental and statistical model.

## 4. NeuroKit2-derived physiology

- ECG/HRV: visually validate R-peaks and ectopic beat corrections; report segment length and sampling frequency.
- EDA: inspect signal polarity, tonic/phasic separation, response delays and motion artifacts.
- RSP: verify inspiration/expiration conventions, polarity and respiratory cycles.
- EMG: check electrode configuration, signal rectification, filtering and baseline/noise properties.
- PPG/EOG: verify quality and event detection on representative recordings.

## 5. MNE advanced procedures

- ICA: inspect independent component time courses, properties and topographies before deciding exclusions; do not automate exclusions from this preview.
- Montage: distinguish template 10–20 positions from digitized electrode coordinates.
- Epochs: inspect event counts, drops, bad intervals and baseline handling.
- Coherence: assess artifacts, volume conduction, reference effects and stationarity; never interpret coherence as directed neural communication.

## 6. Versioning and reproducibility

- Archive the original binary acquisition (EDF/BDF/FIF etc.) separately from derivative exports.
- Export metadata, channel descriptions, filter history and code versions.
- Report all exclusions and missing data handling.
- Replicate calculations on a trusted reference toolbox and document deviations.
- Keep software version and scientific validation cases alongside the publication.

## Validation status

| Category | Implemented | Validation status |
|---|---|---|
| CSV/TSV import | Yes | Unit and time-axis verification required |
| Synthetic demonstration | Yes | Deterministic example only |
| Browser filtering | Yes | Educational preview, not publication-validated |
| SciPy filtering | Yes | Algorithm tests included; benchmark pending |
| Welch PSD / FFT | Yes | Reference comparisons beyond basic tests pending |
| ERP and SEM | Yes | Manual artifact rejection needed |
| NeuroKit2 modalities | Yes | Dataset-level validation pending |
| MNE ICA / montage | Exploratory | No automated component rejection |
| HRV | Yes | Duration and peak verification needed |
| Clinical use | No | Outside project scope |

## Methodological references

- Gramfort et al. (2013), *Frontiers in Neuroscience*, 7, 267. DOI: 10.3389/fnins.2013.00267.
- Makowski et al. (2021), *Behavior Research Methods*, 53, 1689–1696. DOI: 10.3758/s13428-020-01516-y.
- Welch (1967), *IEEE Transactions on Audio and Electroacoustics*, 15(2), 70–73. DOI: 10.1109/TAU.1967.1161901.
