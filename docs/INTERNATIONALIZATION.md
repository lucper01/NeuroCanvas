# Internationalization and personalization

NeuroCanvas has a deterministic, offline **French/English** language layer.

## Behavior

- **Automatic (browser)** is the default. French browser locales (e.g. `fr-FR`, `fr-CA`) select French; other locales select English.
- The user can override with **Français** or **English** in **Personalization**.
- Settings persist in browser `localStorage` under `neurocanvas.preferences.v1`; failures to store are safely ignored.
- The language can be changed without reloading the application and is updated if the browser changes language while Automatic is selected.
- The HTML `lang` property is kept in sync for accessibility.
- The same menu also offers standard and compact interface density.

## Scientific data are immutable under localization

The app does not send text to a translation API. Local reviewed translation dictionaries affect *presentation labels only*, not binary signals, channel IDs, trigger integers, condition names supplied by the user, original event labels, CSV measurements, timestamps, or physical units. Do not translate condition identifiers in provenance or analytical exports.

## Developer maintenance

- Core interface strings: `frontend/src/localization.tsx`.
- Trigger module labels: `frontend/src/TriggerStudio.tsx` in `EN`.
- Language/persistence tests: `frontend/src/localization.test.ts`.
- End-to-end Playwright locale checks: `frontend/tests/international.spec.ts`.

New user-visible wording must have a reviewed FR/EN mapping and a browser test when it is part of a major workflow. The application falls back to its original literal string when a mapping is missing; translations are **not** fetched from online services.
