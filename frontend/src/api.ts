import type { RecordingInfo, Step, Trace, Spectrum, TimeFrequency, Evoked } from './types'

/** Engine configuration is chosen at runtime, not compiled to localhost for all visitors. */
const LOCAL_ROOT = 'http://127.0.0.1:8000/api'
const CLOUD_ENV = (import.meta.env.VITE_NEUROCANVAS_ENGINE_URL || '').trim()
let ROOT = LOCAL_ROOT
let guestAuthorization: string | null = null

export type EngineHealth = {
  status:string; engine:string; mne:string; neurokit2:string
  mode?:'local'|'shared'; auth?:'none'|'guest'; max_upload_bytes?:number
  features?:string[]
}
export function normalizeEngineURL(source:string):string{
  const url = new URL(source.trim())
  const localhost = ['127.0.0.1','localhost','[::1]'].includes(url.hostname.toLowerCase())
  if ((url.protocol !== 'https:' && !(localhost && url.protocol==='http:')) ||
      url.username || url.password || url.search || url.hash ||
      (url.pathname!=='/' && url.pathname!=='/api' && url.pathname!=='/api/'))
    throw Error('Engine URL must be HTTPS (HTTP permitted only for loopback) with no credentials or query.')
  return url.origin+'/api'
}
export const engineEndpoints={
  local:LOCAL_ROOT,
  cloud:CLOUD_ENV?normalizeEngineURL(CLOUD_ENV):null,
  get current(){return ROOT},
  get connectedToGuest(){return guestAuthorization!==null}
}
function tokenHeaders(init?:RequestInit):Headers{
  const headers=new Headers(init?.headers)
  if (guestAuthorization)headers.set('Authorization','Bearer '+guestAuthorization)
  return headers
}
async function checked(response:Response):Promise<Response>{
  if(!response.ok){
    let message='Engine error '+response.status
    try{
      const payload=await response.json() as {detail?:string}
      message=payload.detail||message
    }catch{ /* may be a binary error response */ }
    throw Error(message)
  }
  return response
}
export async function connectEngine(address:string):Promise<EngineHealth>{
  const next=normalizeEngineURL(address)
  const signal=AbortSignal.timeout(10000)
  const health=await checked(await fetch(next+'/health',{signal}))
  const info=await health.json() as EngineHealth
  if(info.status!=='ok'||!info.engine)throw Error('Incompatible NeuroCanvas Python engine.')
  let guest:string|null=null
  if(info.auth==='guest'){
    const result=await checked(await fetch(next+'/access/guest',{method:'POST',signal}))
    const credentials=await result.json() as {token:string}
    if(!credentials.token)throw Error('Guest access was not granted.')
    guest=credentials.token
  }else if(info.auth && info.auth!=='none'){
    throw Error('Unsupported engine authentication mode.')
  }
  ROOT=next
  guestAuthorization=guest
  return info
}
export function disconnectEngine(){
  ROOT=LOCAL_ROOT
  guestAuthorization=null
}
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response=await checked(await fetch(ROOT+path,{
    ...init, headers:tokenHeaders(init)
  }))
  return response.json() as Promise<T>
}
export async function downloadFromEngine(url:string, filename:string):Promise<void>{
  const root = ROOT+'/'
  if(!url.startsWith(root))throw Error('Download must originate from the connected engine.')
  const response=await checked(await fetch(url,{headers:tokenHeaders()}))
  const content=await response.blob()
  const objectURL=URL.createObjectURL(content)
  const a=document.createElement('a')
  a.href=objectURL; a.download=filename
  a.click()
  setTimeout(()=>URL.revokeObjectURL(objectURL),5000)
}
const encoded = (x: string) => encodeURIComponent(x)
export type BackendInfo = RecordingInfo & { session_id: string }
export const api = {
  health: () => call<EngineHealth>('/health'),
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
                  tolerance = .25, commit = false, bitMask: number | null = null) =>
    call<import('./types').TriggerPreview>('/sessions/' + encoded(id) + '/triggers/detect', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({channel,min_width_ms:minWidthMs,min_interval_ms:minIntervalMs,
        tolerance,commit,bit_mask:bitMask})
    }),
  triggerEvents: (id: string, condition = '') =>
    call<{events:import('./types').MappedTrigger[];count:number;conditions:string[]}>(
      '/sessions/' + encoded(id) + '/triggers/events?condition=' + encoded(condition)),
  triggerEpochs: (id: string, channel: string, condition: string, tmin: number,
                  tmax: number, baselineEnd: number, excludeMarked: boolean,
                  excludeRejected = false, trialOffset = 0, trialLimit = 100) =>
    call<import('./types').ConditionEpochs>('/sessions/' + encoded(id) + '/triggers/epochs?' +
      new URLSearchParams({channel,condition,tmin:String(tmin),tmax:String(tmax),
        baseline_end:String(baselineEnd),exclude_marked:String(excludeMarked),
        exclude_rejected:String(excludeRejected),trial_offset:String(trialOffset),
        trial_limit:String(trialLimit)}).toString()),
  triggerEventURL: (id: string) => ROOT + '/sessions/' + encoded(id) + '/triggers/export/events',
  triggerCodebookURL: (id: string) => ROOT + '/sessions/' + encoded(id) + '/triggers/export/codebook',
  triggerNPZURL: (id: string, condition: string, tmin: number, tmax: number,
                  baselineEnd: number, excludeMarked: boolean, excludeRejected = false) => ROOT +
    '/sessions/' + encoded(id) + '/triggers/export/multichannel?' +
    new URLSearchParams({condition,tmin:String(tmin),tmax:String(tmax),baseline_end:String(baselineEnd),
      exclude_marked:String(excludeMarked),exclude_rejected:String(excludeRejected)}).toString(),
  triggerEpochURL: (id: string, channel:string, condition:string, tmin:number, tmax:number,
                    baselineEnd:number, excludeMarked:boolean, excludeRejected = false) => ROOT + '/sessions/' + encoded(id) +
    '/triggers/export/epochs?' + new URLSearchParams({channel,condition,tmin:String(tmin),
      tmax:String(tmax),baseline_end:String(baselineEnd),exclude_marked:String(excludeMarked),
      exclude_rejected:String(excludeRejected)}).toString(),
  trialReview: (id:string, eventUID:string, rejected:boolean, reason:string) =>
    call<{ event_uid:string; rejected:boolean; metadata:import('./types').RecordingInfo }>(
      '/sessions/' + encoded(id) + '/trials/review', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({event_uid:eventUID,rejected,reason})
      }),
  trialReviewLog: (id:string) => call<{
    recording:string; reviewed:{event_uid:string; rejected:boolean; reason:string;
      onset_s:number|null; code:number|null; event_present:boolean}[]
  }>('/sessions/' + encoded(id) + '/trials/review'),
  conditionMetrics: (id:string,channel:string,tmin:number,tmax:number,
    measureStart:number,measureEnd:number,baselineEnd:number,
    excludeMarked:boolean,excludeRejected:boolean) =>
    call<import('./types').ConditionMetrics>('/sessions/' + encoded(id) + '/triggers/metrics?' +
      new URLSearchParams({channel,tmin:String(tmin),tmax:String(tmax),
        measure_start:String(measureStart),measure_end:String(measureEnd),
        baseline_end:String(baselineEnd),exclude_marked:String(excludeMarked),
        exclude_rejected:String(excludeRejected)}).toString()),
  conditionMetricsURL: (id:string,channel:string,tmin:number,tmax:number,
    measureStart:number,measureEnd:number,baselineEnd:number,
    excludeMarked:boolean,excludeRejected:boolean) =>
    ROOT + '/sessions/' + encoded(id) + '/triggers/export/metrics?' +
    new URLSearchParams({channel,tmin:String(tmin),tmax:String(tmax),
      measure_start:String(measureStart),measure_end:String(measureEnd),
      baseline_end:String(baselineEnd),exclude_marked:String(excludeMarked),
      exclude_rejected:String(excludeRejected)}).toString(),
  remove: (id: string) => call<{ deleted: boolean }>('/sessions/' + encoded(id), { method: 'DELETE' })
}
