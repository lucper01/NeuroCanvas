import type { LocalRecording, RecordingInfo, Step, Trace, Spectrum, TimeFrequency, Evoked } from './types'

/** Deterministic synthetic signals, clearly separated from measured biosignals. */
export function demo(fs = 250, seconds = 40, alpha = 10, noise = 1): LocalRecording {
  const n = fs * seconds
  const matrix: number[][] = Array.from({ length: 6 }, () => [])
  let seed = 43
  const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296 }
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand())
  for (let i = 0; i < n; i++) {
    const t = i / fs
    matrix[0].push(12 * Math.sin(2 * Math.PI * alpha * t) + 4 * Math.sin(2 * Math.PI * 20 * t) + 2.5 * noise * gaussian())
    matrix[1].push(9 * Math.sin(2 * Math.PI * (alpha - 2) * t + .7) + 3 * noise * gaussian())
    const phase = ((t - .6) % (60 / 72) + 60 / 72) % (60 / 72)
    matrix[2].push(.07 * Math.sin(2 * Math.PI * 1.2 * t) + Math.exp(-.5 * (Math.min(phase, 60 / 72 - phase) / .025) ** 2))
    matrix[3].push(1 + .004 * t + [6, 15, 27].reduce((v, onset) => v + (t > onset ? .18 * Math.exp(-(t - onset) / 3) : 0), 0))
    matrix[4].push(Math.sin(2 * Math.PI * .23 * t) + .025 * gaussian())
    matrix[5].push((t > 12 && t < 15 ? .2 : .04) * gaussian())
  }
  const names = ['EEG Fz', 'EEG Cz', 'ECG', 'EDA', 'RSP', 'EMG']
  const types = ['eeg', 'eeg', 'ecg', 'eda', 'rsp', 'emg']
  const units = ['µV', 'µV', 'a.u.', 'a.u.', 'a.u.', 'a.u.']
  const info: RecordingInfo = {
    name: 'Démonstration physiologique synthétique', sfreq: fs,
    samples: n, duration: (n - 1) / fs,
    channels: names.map((name, i) => ({ name, type: types[i], unit: units[i] })),
    events: [5, 10, 15, 20, 25, 30, 35].map(time => ({ time, label: 'stimulus', duration: 0 })),
    history: [], source: 'synthetic/browser',
    warnings: ['Données entièrement simulées, sans mesure physiologique humaine.']
  }
  return { info, raw: matrix, processed: matrix.map(y => [...y]) }
}

function parseRow(line: string, separator: string) {
  const out: string[] = []
  let buffer = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') { buffer += '"'; i++ }
      else quoted = !quoted
    } else if (line[i] === separator && !quoted) { out.push(buffer.trim()); buffer = '' }
    else buffer += line[i]
  }
  out.push(buffer.trim())
  return out
}

/** CSV/TSV parsing. Time column must be uniformly sampled or explicit Fs is required. */
export function importCSV(text: string, filename: string, customFs?: number): LocalRecording {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.trim().length)
  if (lines.length < 3) throw Error('Fichier vide ou insuffisant.')
  if (lines.length > 300_000) throw Error('Import navigateur limité à 300 000 lignes. Utiliser le moteur Python.')
  const separator = ['\t', ';', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0]
  const header = parseRow(lines[0], separator)
  const timeIndex = header.findIndex(x => ['time_s', 'time', 'seconds', 'time (s)', 'timestamp_s', 't'].includes(x.trim().toLowerCase()))
  const columns = header.map((name, i) => ({ name: name || 'Canal ' + (i + 1), i })).filter(x => x.i !== timeIndex)
  if (!columns.length || columns.length > 64) throw Error('Le CSV doit contenir entre 1 et 64 canaux pour le mode navigateur.')
  const data: number[][] = columns.map(() => [])
  const times: number[] = []
  for (const line of lines.slice(1)) {
    const row = parseRow(line, separator)
    if (row.length !== header.length) throw Error('Nombre de colonnes incohérent dans le CSV.')
    columns.forEach((col, i) => {
      const raw = row[col.i].replace(',', '.')
      if (!raw.length) throw Error('Valeur manquante dans ' + col.name + '. Corriger le CSV ou utiliser le moteur Python.')
      const value = Number(raw)
      if (!Number.isFinite(value)) throw Error('Valeur non numérique dans ' + col.name + '.')
      data[i].push(value)
    })
    if (timeIndex >= 0) {
      const x = Number(row[timeIndex].replace(',', '.'))
      if (!Number.isFinite(x)) throw Error('Horodatages non numériques.')
      times.push(x)
    }
  }
  let inferred: number | undefined
  if (times.length >= 3) {
    const diffs = times.slice(1).map((v, i) => v - times[i])
    const sorted = [...diffs].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    if (median > 0 && diffs.every(d => d > 0 && Math.abs(d - median) <= .02 * median)) inferred = 1 / median
  }
  if (timeIndex >= 0 && !inferred) throw Error('Horodatages irréguliers. Rééchantillonner avant import.')
  const fs = customFs || inferred
  if (!fs || !Number.isFinite(fs) || fs <= 0) throw Error('Saisir la fréquence d’échantillonnage (Hz) ; aucun temps régulier détecté.')
  const info: RecordingInfo = {
    name: filename, sfreq: fs, samples: data[0].length,
    duration: (data[0].length - 1) / fs, source: 'csv/browser',
    channels: columns.map(x => ({ name: x.name, type: 'misc', unit: 'a.u.' })),
    events: [], history: [], warnings: inferred && customFs && Math.abs(customFs - inferred) > .02 * inferred
      ? ['Fs choisie et fréquence déduite des horodatages divergent.'] : []
  }
  return { info, raw: data, processed: data.map(y => [...y]) }
}

/**
 * Biquad forward/backward: interactive educational preview only.
 * For validated zero-phase SOS filtering with edge control, use the Python engine.
 */
function biquad(row: number[], fs: number, cutoff: number, mode: 'lowpass' | 'highpass' | 'notch', Q = .7071) {
  if (!(cutoff > 0 && cutoff < fs / 2)) throw Error('Fréquence hors de (0, Nyquist).')
  const theta = 2 * Math.PI * cutoff / fs, c = Math.cos(theta), a = Math.sin(theta) / (2 * Q)
  let b0 = 1, b1 = -2 * c, b2 = 1
  if (mode === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0 }
  if (mode === 'highpass') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0 }
  const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  return row.map(x => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1; x1 = x; y2 = y1; y1 = y
    return y
  })
}
function bidirectional(row: number[], fs: number, cutoff: number, type: 'lowpass' | 'highpass' | 'notch', q?: number) {
  return biquad(biquad(row, fs, cutoff, type, q).reverse(), fs, cutoff, type, q).reverse()
}

export function applySteps(recording: LocalRecording, steps: Step[]): LocalRecording {
  const processed = recording.raw.map(x => [...x])
  const fs = recording.info.sfreq
  for (const step of steps) {
    const picks = recording.info.channels.map((ch, i) => ({ ch, i }))
      .filter(x => !step.channels?.length || step.channels.includes(x.ch.name)).map(x => x.i)
    if (!picks.length) throw Error('Aucun canal correspondant au traitement.')
    if (step.method === 'average_reference') {
      const eeg = picks.filter(i => recording.info.channels[i].type === 'eeg')
      if (eeg.length < 2) throw Error('La référence moyenne nécessite au moins deux canaux EEG.')
      for (let t = 0; t < processed[0].length; t++) {
        const mean = eeg.reduce((sum, i) => sum + processed[i][t], 0) / eeg.length
        eeg.forEach(i => { processed[i][t] -= mean })
      }
      continue
    }
    for (const i of picks) {
      let x = processed[i]
      if (step.method === 'filter') {
        if (step.low == null && step.high == null) throw Error('Définir une fréquence de coupure.')
        if (step.low != null && step.high != null && step.low >= step.high) throw Error('La borne basse doit précéder la borne haute.')
        if (step.low != null) x = bidirectional(x, fs, step.low, 'highpass')
        if (step.high != null) x = bidirectional(x, fs, step.high, 'lowpass')
      } else if (step.method === 'notch') x = bidirectional(x, fs, step.frequency || 50, 'notch', step.quality || 30)
      else if (step.method === 'demean') {
        const mean = x.reduce((a, b) => a + b, 0) / x.length
        x = x.map(v => v - mean)
      } else if (step.method === 'detrend') {
        const slope = (x[x.length - 1] - x[0]) / (x.length - 1)
        x = x.map((v, j) => v - x[0] - slope * j)
      } else if (step.method === 'rectify') x = x.map(Math.abs)
      else throw Error('Opération inconnue.')
      processed[i] = x
    }
  }
  return { ...recording, processed, info: { ...recording.info, history: steps } }
}

export function viewport(recording: LocalRecording, channels: string[], start: number, duration: number, useRaw = false): Trace[] {
  const fs = recording.info.sfreq
  const lo = Math.max(0, Math.floor(start * fs))
  const hi = Math.min(recording.info.samples, Math.floor((start + duration) * fs))
  const matrix = useRaw ? recording.raw : recording.processed
  return channels.slice(0, 16).flatMap(name => {
    const idx = recording.info.channels.findIndex(ch => ch.name === name)
    if (idx < 0 || hi <= lo) return []
    const x: number[] = [], y: number[] = []
    const row = matrix[idx]
    const block = Math.max(1, Math.ceil((hi - lo) / 650))
    for (let i = lo; i < hi; i += block) {
      let lowest = i, highest = i
      for (let j = i + 1; j < Math.min(i + block, hi); j++) {
        if (row[j] < row[lowest]) lowest = j
        if (row[j] > row[highest]) highest = j
      }
      for (const j of [...new Set([lowest, highest])].sort((a, b) => a - b)) {
        x.push(j / fs); y.push(row[j])
      }
    }
    return [{ name, x, y, type: recording.info.channels[idx].type, unit: recording.info.channels[idx].unit }]
  })
}
function fft(samples: number[]) {
  const n = samples.length, re = [...samples], im = new Array(n).fill(0)
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    while (j & bit) { j ^= bit; bit >>= 1 }
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len *= 2) {
    const ar = Math.cos(-2 * Math.PI / len), ai = Math.sin(-2 * Math.PI / len)
    for (let k = 0; k < n; k += len) {
      let wr = 1, wi = 0
      for (let j = 0; j < len / 2; j++) {
        const u = k + j, v = u + len / 2
        const r = wr * re[v] - wi * im[v], s = wr * im[v] + wi * re[v]
        re[v] = re[u] - r; im[v] = im[u] - s
        re[u] += r; im[u] += s
        const next = wr * ar - wi * ai
        wi = wr * ai + wi * ar; wr = next
      }
    }
  }
  return { re, im }
}
function segmentPSD(segment: number[], fs: number) {
  const n = segment.length, mean = segment.reduce((a, b) => a + b, 0) / n
  const win = segment.map((_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (n - 1)))
  const normalization = fs * win.reduce((a, w) => a + w * w, 0)
  const result = fft(segment.map((v, i) => (v - mean) * win[i]))
  return result.re.slice(0, n / 2 + 1).map((real, i) => {
    const power = (real * real + result.im[i] * result.im[i]) / normalization
    return power * (i === 0 || i === n / 2 ? 1 : 2)
  })
}
export function spectrum(rec: LocalRecording, name: string, start = 0, duration = 30): Spectrum {
  const idx = rec.info.channels.findIndex(c => c.name === name)
  if (idx < 0) throw Error('Canal inconnu.')
  const fs = rec.info.sfreq
  const samples = rec.processed[idx].slice(Math.floor(start * fs), Math.min(rec.info.samples, Math.floor((start + duration) * fs)))
  if (samples.length < 16) throw Error('Au moins 16 échantillons sont nécessaires.')
  let n = 1
  while (n * 2 <= Math.min(2048, samples.length)) n *= 2
  const cumulative = new Array(n / 2 + 1).fill(0)
  let total = 0
  for (let i = 0; i + n <= samples.length; i += n / 2) {
    segmentPSD(samples.slice(i, i + n), fs).forEach((value, j) => { cumulative[j] += value })
    total++
  }
  return { frequency: cumulative.map((_, j) => fs * j / n),
    psd: cumulative.map(v => v / total), nperseg: n,
    method: 'Welch (Hann, 50 % de recouvrement), navigateur',
    unit: rec.info.channels[idx].unit + '²/Hz' }
}
export function spectrogram(rec: LocalRecording, name: string, start = 0, duration = 30): TimeFrequency {
  const idx = rec.info.channels.findIndex(c => c.name === name)
  if (idx < 0) throw Error('Canal inconnu.')
  const fs = rec.info.sfreq
  const samples = rec.processed[idx].slice(Math.floor(start * fs), Math.min(rec.info.samples, Math.floor((start + duration) * fs)))
  let n = 1
  while (n * 2 <= Math.min(256, Math.floor(samples.length / 2))) n *= 2
  if (n < 16) throw Error('Fenêtre trop courte pour l’analyse temps-fréquence.')
  const times: number[] = [], columns: number[][] = []
  for (let i = 0; i + n <= samples.length; i += n / 2) {
    times.push(start + (i + n / 2) / fs)
    columns.push(segmentPSD(samples.slice(i, i + n), fs))
  }
  const frequency = Array.from({ length: n / 2 + 1 }, (_, i) => i * fs / n)
  return { frequency, time: times,
    power: frequency.map((_, i) => columns.map(column => 10 * Math.log10(Math.max(1e-24, column[i])))),
    unit: 'dB re 1 ' + rec.info.channels[idx].unit + '²/Hz' }
}
export function erp(rec: LocalRecording, channel: string, label: string, tmin = -.2, tmax = .8): Evoked {
  const idx = rec.info.channels.findIndex(c => c.name === channel)
  if (idx < 0 || tmin >= tmax) throw Error('Canal ou fenêtre invalide.')
  const fs = rec.info.sfreq
  const a = Math.round(tmin * fs), b = Math.round(tmax * fs)
  const trials: number[][] = []
  let excluded = 0
  for (const event of rec.info.events.filter(x => !label || x.label === label)) {
    const sample = Math.round(event.time * fs), lo = sample + a, hi = sample + b + 1
    if (lo < 0 || hi > rec.info.samples) { excluded++; continue }
    const data = rec.processed[idx].slice(lo, hi)
    const baselineSamples = Math.max(0, Math.min(data.length, -a + 1))
    const baseline = baselineSamples ? data.slice(0, baselineSamples).reduce((x, y) => x + y, 0) / baselineSamples : 0
    trials.push(data.map(x => x - baseline))
  }
  if (!trials.length) throw Error('Aucun essai complet pour cette fenêtre événementielle.')
  const time = Array.from({ length: b - a + 1 }, (_, i) => (a + i) / fs)
  return { time, mean: time.map((_, i) => trials.reduce((acc, row) => acc + row[i], 0) / trials.length),
    sem: time.map((_, i) => {
      if (trials.length < 2) return null
      const values = trials.map(row => row[i])
      const mean = values.reduce((acc, x) => acc + x, 0) / values.length
      return Math.sqrt(values.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (values.length - 1)) / Math.sqrt(values.length)
    }),
    n: trials.length, excluded, unit: rec.info.channels[idx].unit }
}


/** Single-sided amplitude spectrum: Hann window with coherent-gain correction. */
export function fourier(rec: LocalRecording, channel: string, start = 0, duration = 30) {
  const idx = rec.info.channels.findIndex(ch => ch.name === channel)
  if (idx < 0) throw Error('Canal inconnu.')
  const fs = rec.info.sfreq
  const row = rec.processed[idx].slice(Math.floor(start * fs),
    Math.min(rec.info.samples, Math.floor((start + duration) * fs)))
  if (row.length < 16) throw Error('Au moins 16 échantillons sont nécessaires.')
  // Use the largest power-of-two segment fitting the selected time window.
  let n = 1
  while (n * 2 <= row.length && n < 131072) n *= 2
  const windowed = row.slice(0, n)
  const avg = windowed.reduce((a, b) => a + b, 0) / n
  const w = windowed.map((_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (n - 1)))
  const gain = w.reduce((a, b) => a + b, 0)
  const result = fft(windowed.map((v, i) => (v - avg) * w[i]))
  const frequency: number[] = [], amplitude: number[] = []
  for (let i = 0; i <= n / 2; i++) {
    frequency.push(i * fs / n)
    const multiplier = i === 0 || i === n / 2 ? 1 : 2
    amplitude.push(multiplier * Math.hypot(result.re[i], result.im[i]) / gain)
  }
  return { frequency, amplitude, unit: rec.info.channels[idx].unit,
    method: 'FFT, Hann coherent gain, segment power-of-two / browser' }
}
