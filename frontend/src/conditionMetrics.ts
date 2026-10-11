import type { ConditionMetrics, LocalRecording } from './types'
import { conditionEpochs } from './triggers'

export function summarizeConditions(rec: LocalRecording, channel: string,
  tmin: number, tmax: number, measurementStart: number, measurementEnd: number,
  baselineEnd: number, excludeMarked: boolean, excludeRejected: boolean): ConditionMetrics {
  if (![tmin,tmax,measurementStart,measurementEnd,baselineEnd].every(Number.isFinite) ||
    !(tmin < tmax && tmin <= measurementStart && measurementStart < measurementEnd &&
      measurementEnd <= tmax)) throw Error('Fenêtre de mesure invalide.')
  const conditions=[...new Set((rec.info.trigger_definitions||[]).flatMap(x=>x.conditions))].sort()
  if(conditions.length>100)throw Error('Maximum 100 conditions.')
  const out=conditions.map(condition=>{
    try {
      const result=conditionEpochs(rec,channel,condition,tmin,tmax,baselineEnd,excludeMarked,excludeRejected)
      const indices=result.time.map((time,i)=>time>=measurementStart-1e-9 && time<=measurementEnd+1e-9?i:-1).filter(i=>i>=0)
      if(!indices.length)throw Error('La fenêtre de mesure ne contient aucun échantillon.')
      const points=indices.map(i=>result.mean[i])
      const peakIndex=points.reduce((best,v,i)=>Math.abs(v)>Math.abs(points[best])?i:best,0)
      let area=0
      for(let i=1;i<indices.length;i++)area+=(result.mean[indices[i]]+result.mean[indices[i-1]])*
        (result.time[indices[i]]-result.time[indices[i-1]])/2
      return {condition,status:'ok',n:result.n,codes:result.codes,
        excluded_bounds:result.excluded_bounds,excluded_manual:result.excluded_manual,
        excluded_rejected:result.excluded_rejected||0,
        mean_amplitude:points.reduce((acc,v)=>acc+v,0)/points.length,
        peak_amplitude:points[peakIndex],
        peak_latency_s:result.time[indices[peakIndex]],auc:area,unit:result.unit}
    } catch(e) {
      if(e instanceof Error && e.message.includes('Aucune époque valide'))
        return {condition,status:'no_valid_trials',n:0}
      throw e
    }
  })
  return {channel,tmin,tmax,baseline_end:baselineEnd,
    measurement_window:[measurementStart,measurementEnd],
    exclude_marked:excludeMarked,exclude_rejected:excludeRejected,
    conditions:out,
    warning:'Mesures descriptives uniquement, aucune inférence statistique.'}
}

export function metricsCSV(result: ConditionMetrics):string {
  const headers=['condition','n','status','mean_amplitude','peak_amplitude',
    'peak_latency_s','signed_auc','unit','codes','excluded_bounds','excluded_manual',
    'excluded_rejected','measure_start_s','measure_end_s','exclude_marked','exclude_rejected']
  const quote=(v:string|number|boolean|undefined)=>'"'+String(v??'').replace(/"/g,'""')+'"'
  const rows=result.conditions.map(row=>[
    row.condition,row.n,row.status,row.mean_amplitude,row.peak_amplitude,
    row.peak_latency_s,row.auc,row.unit,JSON.stringify(row.codes||{}),
    row.excluded_bounds,row.excluded_manual,row.excluded_rejected,
    result.measurement_window[0],result.measurement_window[1],
    result.exclude_marked,result.exclude_rejected
  ].map(quote).join(','))
  return [headers.join(','),...rows].join('\n')
}
