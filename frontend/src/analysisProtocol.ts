import type { TriggerDefinition } from './types'
import { validateDefinitions } from './triggers'

/** Portable method recipe. Never includes acquisition samples or identifiers. */
export type AnalysisProtocol = {
  schema: 'neurocanvas.analysis-protocol.v1'
  name: string
  saved_at: string
  detection: {
    channel: string
    min_width_ms: number
    min_interval_ms: number
    tolerance: number
    bit_mask: number | null
  }
  codebook: TriggerDefinition[]
  epoch: {
    channel: string
    tmin: number
    tmax: number
    baseline_end: number
    measurement_start: number
    measurement_end: number
    exclude_marked: boolean
    exclude_rejected: boolean
  }
}

const validNumber = (v: unknown, low: number, high: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

export function parseAnalysisProtocol(value: unknown): AnalysisProtocol {
  if (!isRecord(value) || value.schema !== 'neurocanvas.analysis-protocol.v1' ||
      typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120 ||
      typeof value.saved_at !== 'string' ||
      !isRecord(value.detection) || !isRecord(value.epoch) ||
      !Array.isArray(value.codebook)) throw Error('Fichier de protocole invalide ou incompatible.')
  const d=value.detection, e=value.epoch
  if (typeof d.channel !== 'string' || d.channel.length > 180 ||
      !validNumber(d.min_width_ms,0,1000) ||
      !validNumber(d.min_interval_ms,0,5000) ||
      !validNumber(d.tolerance,0,.49) ||
      (d.bit_mask !== null && (!validNumber(d.bit_mask,1,16777215) ||
         !Number.isInteger(d.bit_mask)))) throw Error('Paramètres de détection invalides.')
  if (typeof e.channel !== 'string' || e.channel.length > 180 ||
      !validNumber(e.tmin,-120,120) || !validNumber(e.tmax,-120,120) ||
      !(Number(e.tmin) < Number(e.tmax)) ||
      !validNumber(e.baseline_end,Number(e.tmin),Number(e.tmax)) ||
      !validNumber(e.measurement_start,Number(e.tmin),Number(e.tmax)) ||
      !validNumber(e.measurement_end,Number(e.tmin),Number(e.tmax)) ||
      !(Number(e.measurement_start)<Number(e.measurement_end)) ||
      typeof e.exclude_marked !== 'boolean' ||
      typeof e.exclude_rejected !== 'boolean') throw Error('Fenêtre d’époquage ou de mesure invalide.')
  return {
    schema:'neurocanvas.analysis-protocol.v1',
    name:value.name.trim(),saved_at:value.saved_at,
    detection:{
      channel:d.channel,min_width_ms:d.min_width_ms as number,
      min_interval_ms:d.min_interval_ms as number,tolerance:d.tolerance as number,
      bit_mask:d.bit_mask as number|null
    },
    codebook:validateDefinitions(value.codebook as TriggerDefinition[]),
    epoch:{
      channel:e.channel,tmin:e.tmin as number,tmax:e.tmax as number,
      baseline_end:e.baseline_end as number,
      measurement_start:e.measurement_start as number,
      measurement_end:e.measurement_end as number,
      exclude_marked:e.exclude_marked as boolean,
      exclude_rejected:e.exclude_rejected as boolean
    }
  }
}

export function createAnalysisProtocol(input: Omit<AnalysisProtocol,'schema'|'saved_at'>): AnalysisProtocol {
  return parseAnalysisProtocol({
    ...input,schema:'neurocanvas.analysis-protocol.v1',
    saved_at:new Date().toISOString()
  })
}
