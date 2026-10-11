import type { BadSegment, LocalRecording, QCReport } from './types'

export function overlapsSegment(start: number, end: number, segment: BadSegment): boolean {
  return Number.isFinite(start) && Number.isFinite(end) &&
    segment.start < end && segment.end > start
}

export function validateMarkedSegment(start: number, end: number, duration: number, reason: string): BadSegment {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= end ||
      end > duration + 1e-6) throw Error('Intervalle invalide : vérifier le début et la fin du segment.')
  if (reason.trim().length < 2 || reason.length > 180) throw Error('Ajouter une justification de 2 à 180 caractères.')
  return { start, end, reason: reason.trim() }
}

export function qualityWindows(
  rec: LocalRecording, windowSeconds = 2, selectedChannel?: string
): QCReport {
  if (!Number.isFinite(windowSeconds) || windowSeconds < .2 || windowSeconds > 60) {
    throw Error('Durée QC : choisir entre 0,2 et 60 secondes.')
  }
  const fs = rec.info.sfreq
  const samplesPerWindow = Math.max(2, Math.round(windowSeconds * fs))
  if (Math.ceil(rec.info.samples / samplesPerWindow) > 2000) {
    throw Error('Trop de fenêtres QC. Augmenter la durée de la fenêtre.')
  }
  const channelIndices = rec.info.channels.map((_, i) => i)
    .filter(i => !selectedChannel || rec.info.channels[i].name === selectedChannel)
  if (!channelIndices.length) throw Error('Canal QC introuvable.')
  const marks = rec.info.bad_segments || []
  const flagged = rec.info.bad_channels || []
  const result = channelIndices.map(index => {
    const y = rec.processed[index]
    const windows = []
    for (let start = 0; start < y.length; start += samplesPerWindow) {
      const end = Math.min(y.length, start + samplesPerWindow)
      if (end - start < 2) continue
      let total = 0, squares = 0, low = Infinity, high = -Infinity, maxStep = 0
      for (let i = start; i < end; i++) {
        total += y[i]; squares += y[i] * y[i]
        low = Math.min(low, y[i]); high = Math.max(high, y[i])
        if (i > start) maxStep = Math.max(maxStep, Math.abs(y[i] - y[i - 1]))
      }
      const count = end - start
      const mean = total / count
      let variance = 0
      for (let i = start; i < end; i++) variance += (y[i] - mean) ** 2
      windows.push({
        start: start / fs, end: end / fs,
        rms: Math.sqrt(squares / count), std: Math.sqrt(variance / count),
        ptp: high - low, max_step: maxStep,
        relative_high_amplitude: false, relative_flat: false,
        manually_excluded: marks.some(mark => overlapsSegment(start / fs, end / fs, mark))
      })
    }
    const sorted = windows.map(x => x.ptp).sort((a,b) => a - b)
    const median = (x: number[]) => !x.length ? 0 :
      x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2
    const mid = median(sorted)
    const mad = median(windows.map(w => Math.abs(w.ptp - mid)).sort((a,b) => a-b))
    windows.forEach(w => {
      w.relative_high_amplitude = mad > 0 && w.ptp > mid + 8 * 1.4826 * mad
      w.relative_flat = mid > 0 && w.ptp < .001 * mid
    })
    return { name: rec.info.channels[index].name, type: rec.info.channels[index].type,
      unit: rec.info.channels[index].unit, marked_bad: flagged.includes(rec.info.channels[index].name),
      median_ptp: mid, windows }
  })
  return { channel_results: result, window_seconds: windowSeconds,
    rules: {
      relative_high_amplitude: 'PTP > médiane + 8 × 1,4826 × MAD',
      relative_flat: 'PTP < 0,001 × médiane(PTP)'
    },
    warning: 'Signaux suspects détectés par contraste intra-canal uniquement. Aucune exclusion automatique.' }
}
