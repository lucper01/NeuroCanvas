# NeuroCanvas visual design system: Neural Night

## Direction

The default interface is designed as a professional **dark neuroscience instrument dashboard** inspired by spectral/neuroimaging displays. The aim is to support dense scientific information without making cognitive or clinical claims from simple spectra.

The main view is composed of:
- A deep midnight navy application shell and compact, higher-contrast navigation.
- Thin, consistent panel outlines and soft cyan, violet and coral spectral accents.
- A **conceptual** luminous brain illustration. It is not a real participant brain, MRI, source reconstruction or topographic result.
- Real waveform miniatures generated from the active recording's selected signal traces.
- A five-band spectral profile, computed from the active PSD, with relative contributions over the displayed frequency bands. This is descriptive and not a concentration, sleep, mood or brain-health classifier.
- Compact metrics, actual signal previews, quick shortcuts to data import and trigger analysis.
- Fluid mobile and tablet layouts; no data feature is intentionally hidden on mobile.

The theme is consistent across **Signal Explorer, Frequency Lab, Signal Processing, Trigger & Epoch Studio, Artifact Review and advanced analyses**. Browser-only and Python-backed sessions use the same user interface.

## Themes and persistence

The Personalization dialog has:
- Language: Automatic, Français, English
- Appearance: Neural Night (**Dark**, default) and Research Light (**Light**)
- Density: Standard and Compact

The choice is saved locally in the browser under `neurocanvas.preferences.v1`. Existing preferences without an appearance field migrate to Dark while retaining their language and density. Scientific acquisition data, units and condition labels are never modified.

## Color foundations

| Role | Neural Night |
| --- | --- |
| Shell | `#090d16` |
| Sidebar | `#0c111c` |
| Surface | `#171e2b` |
| Stroke | `#334056` |
| Foreground | `#e8eefb` |
| Muted text | `#9aaac1` |
| Cyan signal | `#56c8f1` |
| Violet signal | `#ad91ff` |
| Coral signal | `#ff83ae` |
| Green signal | `#59dcb5` |

The visual language uses the spectrum colors as chart affordances, not diagnostic indicators.

## Scientific graphics

Interactive Plotly charts match the appearance theme for on-screen inspection. Exported PNG/SVG plots use a high-contrast, white-background scientific style regardless of an active dark dashboard theme.

The application does not recolor raw numerical amplitudes or modify the numerical processing pipeline to implement theme changes.

## Accessibility and quality assurance

- Native form controls use matching dark/light color schemes.
- Focus-visible controls use a high-contrast outline.
- Support for prefers-reduced-motion disables incidental motion effects.
- Responsive layouts target phones, tablets and large lab monitors.
- Unit tests cover preference migration and persistence.
- Headless Chromium desktop/mobile scenarios verify theme switching, labels, recording preservation and the dashboard.
- GitHub Actions can save desktop/mobile screenshots as review artifacts.

## Limits

Neural Night's brain rendering is a decorative scientific illustration, not a 3D anatomical viewer. Real 3D MR surface reconstructions or source-localized EEG require validated geometric data and separate data/model pipelines. Such pipelines must never be implied by this visual treatment.
