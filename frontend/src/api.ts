import type { RecordingInfo, Step, Trace, Spectrum, TimeFrequency, Evoked } from './types'

const ROOT = 'http://127.0.0.1:8000/api'
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(ROOT + path, init)
  if (!response.ok) {
    let message = 'Erreur ' + response.status
    try { const payload = await response.json(); message = payload.detail || message } catch { /* API may not return JSON. */ }
    throw Error(typeof message === 'string' ? message : JSON.stringify(message))
  }
  return response.json() as Promise<T>
}
const encoded = (x: string) => encodeURIComponent(x)
export type BackendInfo = RecordingInfo & { session_id: string }
export const api = {
  health: () => call<{ status: string; engine: string; mne: string; neurokit2: string }>('/health'),
  demo: () => call<BackendInfo>('/demo', { method: 'POST' }),
  upload: async (file: File, fs?: number) => {
    const form = new FormData()
    form.append('file', file)
    if (fs) form.append('sampling_rate', String(fs))
    return call<BackendInfo>('/import', { method: 'POST', body: form })
  },
  metadata: (id: string) => call<RecordingInfo>('/sessions/' + encoded(id)),
  viewport: async (id: string, names: string[], start: number, duration: number, raw = false) => {
    const response = await call<{ traces: Trace[] }>('/sessions/' + encoded(id) + '/viewport', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channels: names, start, duration, max_points: 1500, raw })
    })
    return response.traces
  },
  pipeline: (id: string, steps: Step[]) => call<RecordingInfo>('/sessions/' + encoded(id) + '/pipeline', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ steps })
  }),
  spectrum: (id: string, name: string, start: number, duration: number) =>
    call<Spectrum>('/sessions/' + encoded(id) + '/psd?channel=' + encoded(name) + '&start=' + start + '&duration=' + duration),
  spectrogram: (id: string, name: string, start: number, duration: number) =>
    call<TimeFrequency>('/sessions/' + encoded(id) + '/spectrogram?channel=' + encoded(name) + '&start=' + start + '&duration=' + duration),
  erp: (id: string, channel: string, label: string, tmin: number, tmax: number, excludeMarked = false) =>
    call<Evoked>('/sessions/' + encoded(id) + '/erp?channel=' + encoded(channel) + '&label=' + encoded(label) + '&tmin=' + tmin + '&tmax=' + tmax + '&exclude_marked=' + excludeMarked),
  physiology: (id: string, channel: string, modality: string) =>
    call<{ modality: string; channel: string; summary: Record<string, number>; markers: Record<string, number[]>; series: { name: string; time: number[]; values: (number | null)[] }[]; software: string }>(
      '/sessions/' + encoded(id) + '/physiology?channel=' + encoded(channel) + '&modality=' + encoded(modality)),
  addEvent: (id: string, time: number, label: string) => call<RecordingInfo>('/sessions/' + encoded(id) + '/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time, label, duration: 0 })
  }),
  csvURL: (id: string, processed = true) => ROOT + '/sessions/' + encoded(id) + '/export/csv?processed=' + processed,
  editChannel: (id: string, index: number, type: string, unit: string) =>
    call<RecordingInfo>('/sessions/' + encoded(id) + '/channels/' + index, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, unit })
    }),
  quality: (id: string) => call<{ channels: Record<string, string | number | boolean>[]; flags: string[] }>(
    '/sessions/' + encoded(id) + '/quality'),
  fft: (id: string, channel: string, start: number, duration: number) =>
    call<{ frequency: number[]; amplitude: number[]; unit: string; method: string }>(
      '/sessions/' + encoded(id) + '/fft?channel=' + encoded(channel) + '&start=' + start + '&duration=' + duration),
  coherence: (id: string, first: string, second: string, start: number, duration: number) =>
    call<{ frequency: number[]; coherence: number[]; first: string; second: string; description: string }>(
      '/sessions/' + encoded(id) + '/coherence?first=' + encoded(first) + '&second=' + encoded(second) +
      '&start=' + start + '&duration=' + duration),
  mnePSD: (id: string, start: number, duration: number) =>
    call<{ channels: string[]; frequency: number[]; power: number[][]; unit: string; method: string }>(
      '/sessions/' + encoded(id) + '/mne/psd?start=' + start + '&duration=' + duration),
  mneEpochs: (id: string, label: string, excludeMarked = false) =>
    call<{ time: number[]; channels: string[]; average: number[][]; n: number; excluded: number; unit: string }>(
      '/sessions/' + encoded(id) + '/mne/epochs?label=' + encoded(label) + '&exclude_marked=' + excludeMarked),
  montage: (id: string) =>
    call<{ channels: { name: string; x: number; y: number; z: number }[]; montage: string; warning: string }>(
      '/sessions/' + encoded(id) + '/mne/montage'),
  ica: (id: string, count = 10) =>
    call<{ component_count: number; explained_variance_ratio: Record<string, number>; warning: string }>(
      '/sessions/' + encoded(id) + '/mne/ica?n_components=' + count),
  hrv: (id: string, channel: string) =>
    call<{ channel: string; features: Record<string, number | null>; r_peaks: number[]; warning: string }>(
      '/sessions/' + encoded(id) + '/neurokit/hrv?channel=' + encoded(channel)),
  qcWindows: (id: string, channel: string, windowSeconds: number) => call<import('./types').QCReport>(
    '/sessions/' + encoded(id) + '/qc/windows?channel=' + encoded(channel) + '&window_seconds=' + windowSeconds),
  qcMarkSegment: (id: string, start: number, end: number, reason: string) => call<RecordingInfo>(
    '/sessions/' + encoded(id) + '/qc/segments', { method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({start,end,reason}) }),
  qcRemoveSegment: (id: string, index: number) => call<RecordingInfo>(
    '/sessions/' + encoded(id) + '/qc/segments/' + index, { method: 'DELETE' }),
  qcMarkChannel: (id: string, name: string, marked: boolean) => call<RecordingInfo>(
    '/sessions/' + encoded(id) + '/qc/channels', { method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name,marked}) }),
  triggerCodebook: (id: string, definitions: import('./types').TriggerDefinition[]) =>
    call<RecordingInfo>('/sessions/' + encoded(id) + '/triggers/codebook', {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body:JSON.stringify({definitions})
    }),
  triggerDetect: (id: string, channel: string, minWidthMs = 0, minIntervalMs = 0,
                  tolerance = .25, commit = false) =>
    call<import('./types').TriggerPreview>('/sessions/' + encoded(id) + '/triggers/detect', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({channel,min_width_ms:minWidthMs,min_interval_ms:minIntervalMs,tolerance,commit})
    }),
  triggerEvents: (id: string, condition = '') =>
    call<{events:import('./types').MappedTrigger[];count:number;conditions:string[]}>(
      '/sessions/' + encoded(id) + '/triggers/events?condition=' + encoded(condition)),
  triggerEpochs: (id: string, channel: string, condition: string, tmin: number,
                  tmax: number, baselineEnd: number, excludeMarked: boolean) =>
    call<import('./types').ConditionEpochs>('/sessions/' + encoded(id) + '/triggers/epochs?' +
      new URLSearchParams({channel,condition,tmin:String(tmin),tmax:String(tmax),
        baseline_end:String(baselineEnd),exclude_marked:String(excludeMarked)}).toString()),
  triggerEventURL: (id: string) => ROOT + '/sessions/' + encoded(id) + '/triggers/export/events',
  triggerCodebookURL: (id: string) => ROOT + '/sessions/' + encoded(id) + '/triggers/export/codebook',
  triggerEpochURL: (id: string, channel:string, condition:string, tmin:number, tmax:number,
                    baselineEnd:number, excludeMarked:boolean) => ROOT + '/sessions/' + encoded(id) +
    '/triggers/export/epochs?' + new URLSearchParams({channel,condition,tmin:String(tmin),
      tmax:String(tmax),baseline_end:String(baselineEnd),exclude_marked:String(excludeMarked)}).toString(),
  remove: (id: string) => call<{ deleted: boolean }>('/sessions/' + encoded(id), { method: 'DELETE' })
}
