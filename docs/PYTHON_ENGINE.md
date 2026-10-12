# NeuroCanvas Universal Python Engine

This document describes the **optional** Python compute engine for NeuroCanvas.
The PWA itself is hosted on GitHub Pages and remains functional without a
Python server for supported browser-native formats and exploratory routines.

## Modes for an international audience

| Mode | Where calculations run | Sharing | Intended use |
| --- | --- | --- | --- |
| Browser | Locally in the PWA | No upload | CSV, EDF/BDF, BrainVision browser preview and light computations |
| Local Python | Python on the user's computer | No public cloud transfer | Private/large recordings, full MNE-Python / NeuroKit2 |
| Shared Python | Isolated short-lived guest session on hosted container | File upload to hosted service | Public educational or appropriately de-identified research data |
| Institution | Institutional HTTPS Python endpoint | According to institutional policy | Research groups with approved infrastructure |

The "Python Engine" section of **Personalization** selects the mode. A shared
server URL can be embedded at build time; a different laboratory can also enter
its own server URL. The interface supports French and English without changing
data labels, trigger codes or signal values.

## Quick start: local

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Open the web PWA, select **Personalization → Python Engine → Local engine** and
connect. The local mode is intentionally not exposed to a public address.

## Deploy a shared prototype to Railway

The repository contains `Dockerfile` and `railway.json`. Use **Deploy from
GitHub Repo** and select `lucper01/NeuroCanvas`; ensure the Dockerfile is used.
Use **one** running instance and **one Uvicorn worker**: sessions are transient,
in-process objects that cannot be shared between replicas.

Configure the service environment:

| Variable | Value |
| --- | --- |
| `NEUROCANVAS_ENGINE_MODE` | `shared` |
| `NEUROCANVAS_TOKEN_SECRET` | A privately generated unpredictable string of 32+ characters, preferably 48+ random bytes encoded as URL-safe text |
| `NEUROCANVAS_ALLOWED_ORIGINS` | `https://lucper01.github.io` (plus approved institutional hosts if needed) |
| `PORT` | Set automatically by the hosting platform; service binds to it |
| `PYTHONUNBUFFERED` | `1` (already included in Dockerfile) |

**Never commit the secret in GitHub, add it to a PWA variable, or expose it
in frontend source.** The Docker image defaults to `shared` mode and refuses
to boot if the secret is missing or shorter than 32 characters.

Configure a public HTTPS domain for the Railway service. Confirm that:

1. `GET https://YOUR-SERVICE/api/health` returns `status: ok`, `mode:
   shared`, and `auth: guest`.
2. Unauthenticated `POST /api/demo` is rejected with HTTP 401.
3. `POST /api/access/guest` returns an expiring, signed guest token.
4. Authorized `POST /api/demo` succeeds with a temporary session ID.
5. A second guest's token cannot access the first guest's session (HTTP 404).

### Connect a public Python URL to GitHub Pages

On the NeuroCanvas GitHub repository, create an **Actions repository variable**
(not a secret) named `NEUROCANVAS_ENGINE_URL` containing the HTTPS service
URL (for example `https://your-service.example.com`). The GitHub Pages
workflow passes it to Vite as `VITE_NEUROCANVAS_ENGINE_URL`.

Then rerun the **NeuroCanvas PWA** workflow on `main`. Once it finishes,
visitors can see **Public NeuroCanvas engine** in the settings and the
application can obtain its own anonymous guest token. The URL is public
by design; the signing secret remains exclusively on the server.

Without a configured public URL, the PWA still offers browser-only,
local Python and custom institutional HTTPS modes.

## Resource and privacy boundaries

The reference service enforces:
- 30 MiB maximum uploaded file and 2 million total signal values in shared mode
- 2 active recordings per guest, 12 active recordings across the single worker
- Approximate 2-hour guest credentials and in-memory recording expiration
- 120 authenticated requests per guest per minute and a basic guest-issuance
  rate limit at the application layer
- Isolation of record IDs, plots and exports by guest authorization
- No disk-based persistence of processed sessions
- A non-root Docker image with low BLAS thread count and bounded concurrency

**These are minimum safeguards, not a security audit**. Anonymous guest tokens
are *not verified identities* and do not prevent multiple fresh guest sessions
per person. A production-scale service additionally needs trusted-edge per-IP
quota enforcement, resource/cost monitoring, abuse prevention, network-layer
request-size limits, approved regional storage/processing, observability and
incident response.

Files used during upload are staged into a temporary directory and discarded;
RAM is used for the duration of the session. However, hosting-provider
infrastructure/logging and third-party subprocesses can carry additional data
handling implications. Do not upload raw identifiable participant data or
protected health information to the public shared engine.

Where consent, GDPR compliance, data processing agreements or a data protection
impact assessment are required, use the **local** engine or an institutionally
approved private deployment. Do not assume the sample public deployment meets
clinical or regulated processing requirements.

## Production limitations

- **One process, one instance**: no distributed queue, database, resumable
  processing, or persistent job state.
- Files above the cloud limits must use browser previews or local Python.
- Tasks are synchronous and have no progress streaming or cancellation yet.
- Service restarts clear all sessions.
- MNE/NeuroKit2 scientific validity depends on signal quality and parameters.
- The PWA never includes `NEUROCANVAS_TOKEN_SECRET`.
- A failing public engine never disables browser-only processing.

For higher concurrency or institutional use, move heavy analyses to a
job queue with per-job CPU/RAM/time caps, authentication, isolated storage,
separate user datasets and explicit retention policies.

## Docker smoke check

```bash
docker build -t neurocanvas-engine .
docker run --rm -p 127.0.0.1:8000:8000 \
  -e NEUROCANVAS_ENGINE_MODE=shared \
  -e NEUROCANVAS_TOKEN_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET \
  neurocanvas-engine
```

Inspect `http://127.0.0.1:8000/api/health`, but do **not** expose local port
8000 directly to untrusted networks. A real public service must terminate
TLS/HTTPS through the hosting platform.

## For developers

The FastAPI code is in `backend/`; access management and quotas live in
`backend/access.py`. The browser URL and transient guest token are managed
in `frontend/src/api.ts`. All export downloads pass through authorized fetch,
not an unauthenticated new tab. Python tests cover guest isolation and session
expiration; browser tests cover API URL selection and authorization.

Note: the public, optional shared engine is a community feature; if the
hosting account is disconnected or out of capacity, local and in-browser
modes remain supported.
