# NeuroCanvas

**NeuroCanvas** is an open-source, hybrid scientific workbench for exploring, transforming, visualizing and teaching neurophysiological and peripheral physiological signals. It combines an installable React/TypeScript progressive web app with an optional local Python processing service based on **MNE-Python**, **NeuroKit2** and **SciPy**.

The project is general-purpose and independent of any single experiment or research programme.

## Modules

| Module | Scope |
| --- | --- |
| Overview | Active recording, duration, sampling rate, channel count, recent signals and quick actions |
| Signal Explorer | Channel selection, synchronized temporal traces, zoom/scroll, event annotations and unprocessed/processed comparison |
| Signal Processing | High/low/band-pass, notch, baseline mean removal, linear detrending, rectification, EEG average referencing and a non-destructive operation history |
| Frequency Lab | Single-sided FFT amplitude spectrum, Welch PSD, spectrograms and numerical integration of canonical EEG frequency bands |
| Neurophysiology Lab | Event-aligned averages with SEM; dedicated ECG, EDA, respiration, EMG, PPG and EOG signal processing using NeuroKit2 |
| Advanced Analysis | Channel QC, magnitude-squared coherence, MNE multichannel PSD and epochs, 10–20 montage preview, exploratory ICA and NeuroKit2 HRV |
| Artifact Review | Non-destructive manual bad-channel and bad-interval review, descriptive window metrics and optional rejection of marked epochs |
| Trigger & Epoch Studio | Detect integer-coded TTL/status pulses; define code meanings and pooled experimental conditions; extract epochs, inspect paginated trials, review individual trials with reasons, view condition-average waveforms and trial heatmaps, and export scientific measurements |
| Internationalization | Automatic French/English interface by browser language, manual overrides and compact/standard display personalization |
| Learning Studio | Seeded synthetic EEG, ECG, EDA, respiration, EMG and trigger-code demonstrations with adjustable oscillation frequency and signal noise |
| Export & Reproducibility | Raw/processed CSV, provenance JSON, locally restorable browser sessions, trigger codebooks, portable analysis protocols (no signal samples), reviewed-trial logs, per-condition measurement CSV, epoch CSV/NPZ and PNG/SVG figures |

**Browser mode** can open CSV/TSV, load/save local JSON sessions, generate demonstrations, identify coded trigger pulses, group trial events and run fast exploratory analysis without a server. **Python mode** enables additional file formats and specialized biomedical algorithms. Python analysis runs **on the user's own computer**, not on GitHub Pages.

## Visual interface

The default interface uses **Neural Night**, a dark, instrument-style neuroscience dashboard with a conceptual luminous brain illustration, live-session waveform previews and PSD-derived frequency-band visualizations. The spectral graphics represent actual available data, not cognitive-state diagnoses. The brain graphic is illustrative rather than a measured MRI or source reconstruction.

Choose **Personalization → Appearance → Dark / Light** to switch between the dark immersive interface and the lighter **Research Light** view. Theme, French/English interface language and standard/compact density preferences are stored locally on the current device. Scientific values and acquisition metadata are not transformed by UI preferences.

On-screen Plotly figures follow the active theme. PNG/SVG scientific plot exports use white-background presentation for reports and manuscripts.

See [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) for the color system, accessibility considerations and visuals' scientific scope.

## Data support

| File | Browser | Python |
| --- | --- | --- |
| CSV / TSV, numeric columns | Yes | Yes |
| JSON exported local session | Yes | Not required |
| BioSemi BDF / EDF | No | MNE |
| FIF | No | MNE |
| BrainVision VHDR + associated files | No | MNE |
| EEGLAB SET | No | MNE |
| Biopac ACQ | No | bioread |
| ZIP containing supported files | No | Yes (import selection; accompanied files retained) |

For CSV/TSV, use a header row and one signal per column. Optional **time_s** should contain equally spaced time coordinates in seconds. Without it, specify the **sampling frequency in Hz** before import. Never assume a default sampling frequency for real data. An example:

```csv
time_s,Fz,Cz,ECG
0,0.000001,0.000002,0.2
0.004,0.000002,0.000001,0.3
0.008,0.000001,-0.000001,0.4
```

For a quick trigger demonstration, open Learning Studio and load the synthetic recording: it includes a **TRIGGER TTL** channel with codes 11, 12, 21 and 22 and preconfigured Visual/Auditory conditions. In Trigger & Epoch Studio, preview and confirm pulses, modify condition groupings, compute epochs aligned to each trigger, examine single trials and trial heatmaps, and save a reusable analysis protocol that contains no raw signal samples. Do not infer hardware trigger timing from these synthetic signals.

No automatic calibration or guessing of unit scaling is applied to generic CSV data. Assign sensor types and units explicitly, verifying that the **underlying numerical values already match the declared units**. EEG analyzed by MNE is internally represented in volts.

## Run the browser app

Requires Node.js 22 or a compatible current LTS.

```bash
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5173**.

For a production build:

```bash
cd frontend
npm run build
npm run preview
```

The web UI can be installed as a progressive web app on browsers that support installation. Offline use covers cached frontend assets and browser-side processing after the app has been installed or loaded at least once.

## Run the optional scientific Python engine

Recommended: Python 3.11 in a virtual environment on the same computer as the browser.

On Linux/macOS:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

On Windows PowerShell:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The API responds at **http://127.0.0.1:8000/api/health** and the automatically generated interactive API documentation at **http://127.0.0.1:8000/docs**. Select **Vérifier la connexion** in the web app. When the engine is running, newly imported recordings are processed by Python.

Backend work is intentionally bound to loopback and keeps recordings in transient in-memory sessions. **Do not expose this API on a public IP or deploy it as-is to an untrusted host**, because this release has no account-level authentication or production rate limiting.

## Deploy the PWA on GitHub Pages

The repository includes a workflow at `.github/workflows/pages.yml`. Enable **Settings → Pages → Build and deployment → GitHub Actions** on the repository, and push to `main` (or trigger the workflow manually). When publishing is configured successfully, the frontend should be available at:

https://lucper01.github.io/NeuroCanvas/

GitHub Pages serves the **frontend only**. Advanced analysis requires the separately running Python server. Backend dependencies cannot run natively within a purely static GitHub Pages deployment.

## Processing and scientific validity

- Raw data and processed data remain separate; the processing pipeline is recalculated from original samples.
- Browser filters are a **pedagogical preview** and are not a validated replacement for SciPy second-order-section zero-phase filters.
- Welch PSD and FFT amplitude spectra are **different estimators with different units** and should not be conflated.
- Event-locked averages and basic peak detection are **not quality-controlled EEG/ECG pipelines** by themselves.
- The ICA functionality is **exploratory**; no automatic ICA component exclusion or clinical interpretation is performed.
- HRV frequency-domain and nonlinear metrics require sufficient recording length, proper peak verification and appropriate assumptions.
- Standard 10–20 electrode positions are approximate templates, not measured electrode coordinates.
- The project is **not medical software** and must not be used to diagnose or treat patients.

See [VALIDATION.md](docs/VALIDATION.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), [TRIGGERS.md](docs/TRIGGERS.md), [INTERNATIONALIZATION.md](docs/INTERNATIONALIZATION.md) and [ROADMAP.md](docs/ROADMAP.md).

## Testing

```bash
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest -q tests
```

The GitHub Actions workflows provide a Python test job and a React production build/deployment. Passing tests demonstrate basic computational expectations, **not scientific validation on real recordings**.

## References

- Gramfort, A. et al. (2013). MEG and EEG data analysis with MNE-Python. *Frontiers in Neuroscience*, 7, 267. https://doi.org/10.3389/fnins.2013.00267
- Makowski, D. et al. (2021). NeuroKit2: A Python toolbox for neurophysiological signal processing. *Behavior Research Methods*, 53, 1689–1696. https://doi.org/10.3758/s13428-020-01516-y
- Virtanen, P. et al. (2020). SciPy 1.0: Fundamental algorithms for scientific computing in Python. *Nature Methods*, 17, 261–272. https://doi.org/10.1038/s41592-019-0686-2

## License

MIT. See [LICENSE](LICENSE).
