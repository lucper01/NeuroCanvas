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
  viewport: async (id: string, names: string[], start: number, duration: number) => {
    const response = await call<{ traces: Trace[] }>('/sessions/' + encoded(id) + '/viewport', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channels: names, start, duration, max_points: 1500 })
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
  erp: (id: string, channel: string, label: string, tmin: number, tmax: number) =>
    call<Evoked>('/sessions/' + encoded(id) + '/erp?channel=' + encoded(channel) + '&label=' + encoded(label) + '&tmin=' + tmin + '&tmax=' + tmax),
  physiology: (id: string, channel: string, modality: string) =>
    call<{ modality: string; channel: string; summary: Record<string, number>; markers: Record<string, number[]>; series: { name: string; time: number[]; values: (number | null)[] }[]; software: string }>(
      '/sessions/' + encoded(id) + '/physiology?channel=' + encoded(channel) + '&modality=' + encoded(modality)),
  addEvent: (id: string, time: number, label: string) => call<RecordingInfo>('/sessions/' + encoded(id) + '/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time, label, duration: 0 })
  }),
  csvURL: (id: string) => ROOT + '/sessions/' + encoded(id) + '/export/csv',
  remove: (id: string) => call<{ deleted: boolean }>('/sessions/' + encoded(id), { method: 'DELETE' })
}
