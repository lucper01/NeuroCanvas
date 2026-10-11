# Product roadmap

This list distinguishes the existing code from **future scope**. Nothing in this document should be interpreted as already deployed or scientifically validated.

## Implemented code in the first repository iteration

- Responsive light-theme React PWA and interactive Plotly charts.
- Offline browser demo, CSV import, educational preprocessing, FFT/PSD/spectrogram, basic ERP.
- Source selection, time navigation, channel classification and annotation.
- Local FastAPI backend with MNE, NeuroKit2 and SciPy.
- EDF/BDF/FIF/BrainVision/EEGLAB/ACQ and zipped-recording import.
- Python filtering, interpolation warnings, provenance and data exports.
- QC, coherence, MNE EEG PSD/epochs/ICA preview/montage and NeuroKit2 HRV.
- Basic simulation-based unit tests.

## Priority next (not yet implemented)

1. Regression tests against fixed known-good MNE, SciPy and NeuroKit2 outputs; continuous frontend browser tests.
2. Electron/Tauri optional desktop distribution, with installation and environment bootstrap.
3. True chunked/streaming and disk-backed handling of very large BDF/EDF/FIF datasets.
4. Per-modality setup wizard for correct input units, orientation, channel types, sampling and sensor calibration.
5. Data inspection and repair UI: segment-level exclusions, bad-channel marking, artifact log and reversible decisions.
6. EEG reference/interpolation workflows and sensor-space topographic maps with measured montage coordinates.
7. Rich ICA component visualization, user decisions and annotated reports.
8. NeuroKit2 event-related and interval-related EDA/RSP/ECG pipelines with publishable tables.
9. Validated time-frequency Morlet/multitaper pipelines and inferential tools.
10. User-configurable and testable export templates: BIDS derivatives, FIF, EDF-compatible derivatives when appropriate, HTML/PDF scientific reports.

## Later development

- Multimodal acquisition synchronization and trigger alignment with drift correction.
- BioSemi 128 and Biopac channel presets without project-specific assumptions.
- Batch processing and reproducible YAML pipelines.
- Provenance hashing, anonymization helper, controlled sharing and secure research storage.
- Interactive montage visualization, connectivity graphs and source localization (when electrode geometry permits).
- Learning modules on sampling, filter phase, leakage, referencing, artifact biases and synthetic pathological cases.
- Independent validation and accessibility/usability audit.

Development should remain modular, version-controlled and conservative about automatic interpretation of physiological features.
