# NeuroCanvas architecture

## Philosophy

NeuroCanvas deliberately separates a **browser-based, offline-capable educational layer** from a **local scientific Python engine**. The user can open, visualize and transform modest data without network services, while MNE and NeuroKit2 operate in an environment suited to numerical signal processing.

### Frontend (React + TypeScript + Vite)

- `src/App.tsx` : interface, module navigation, visualization, processing controls, annotations and exports.
- `src/engine.ts` : deterministic synthetic generator, CSV/TSV reader, browser biquad previews, FFT, Welch, spectrogram and event-locked averages.
- `src/api.ts` : typed requests to the local Python API.
- `src/styles.css` : responsive light theme.
- `vite-plugin-pwa` : installability and caching for the static app.
- Plotly : interactive charts, panning, scale and PNG/SVG outputs.

### Backend (FastAPI + NumPy/SciPy + MNE + NeuroKit2)

- `main.py` : local API, uploaded files, transient sessions, exports, request validation.
- `engine.py` : file formats, channel metadata, non-destructive processing, PSD/spectrogram/ERP, standard NeuroKit2 processing.
- `advanced.py` : descriptive QC, FFT amplitude, coherence, EEG epochs, ICA preview, canonical montage geometry and HRV.
- `tests` : controlled simulation-based tests.

Only the backend handles EDF/BDF/FIF/VHDR/SET/ACQ files. Multicomponent formats must be provided with all their companion files, preferably inside one ZIP.

## Session invariant

A session contains:
1. Acquisition samples `original`, never modified by filter operations.
2. Derived samples `processed`.
3. Sampling frequency `sfreq` and one row of metadata per channel.
4. Event array with onset, label and optional duration.
5. An ordered immutable-style list of processing operations.

After each change, operations run from `original` rather than modifying an already transformed result. The GUI can request earlier windows or new estimates without altering raw samples.

## Storage and privacy

The PWA executes locally. The Python API binds to `127.0.0.1:8000` and keeps sessions in a memory dictionary with an active-session limit. The selected recordings are **not persisted by the API to disk** after import processing, but their temporary upload files are briefly written to the system temporary directory, then deleted on successful or failed completion of the context. A browser session can be explicitly downloaded as a local JSON file.

Python sessions are not durable and disappear when the service restarts. Production-ready multi-user storage, data retention controls, encryption, authentication and traceability are future milestones, not present in this release.

## Research constraints

- Sensor data units must be explicit. MNE's EEG signals use volts internally.
- Browser previews are not identical numerical implementations to SciPy.
- Interpolating missing samples is a scientifically meaningful alteration that is flagged.
- Spectral results require accounting for sampling rate, duration, windowing, reference, line noise and instrumentation.
- The ICA preview cannot be interpreted as proof that artifact components were identified.
- The app deliberately does not automatically classify data as “valid” or “invalid”.

## Performance limits

- Backend: at most 20 million sample values per session, 150 MB uploaded file and 250 MB uncompressed ZIP.
- Browser: CSV/TSV limit 300,000 rows and 64 signals; rendered plots are downsampled preserving local extrema.
- API viewport: maximum 20 channels and maximum 5000 displayed points per channel.
- These are deliberately conservative limits to prevent browser or RAM exhaustion; they are not intrinsic scientific limits.
