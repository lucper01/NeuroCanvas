import type { ConditionEpochs, EventMark, LocalRecording, MappedTrigger,
  TriggerDefinition, TriggerPreview } from './types'

export function eventCode(event: EventMark): number | null {
  if (Number.isInteger(event.code) && Number(event.code) > 0) return Number(event.code)
  const label = String(event.label).trim()
  if (!/^[1-9]\d*$/.test(label)) return null
  const code = Number(label)
  return Number.isSafeInteger(code) ? code : null
}

export function mapTrigger(event: EventMark, definitions: TriggerDefinition[]): MappedTrigger {
  const code = eventCode(event)
  const definition = definitions.find(x => x.code === code)
  return { ...event, code, meaning: definition?.meaning || event.label,
    conditions: definition?.conditions || [] }
}

export function validateDefinitions(definitions: TriggerDefinition[]): TriggerDefinition[] {
  if (definitions.length > 2000) throw Error('Maximum 2 000 codes de triggers.')
  const seen = new Set<number>()
  return definitions.map(item => {
    if (!Number.isInteger(item.code) || item.code < 1 || item.code > 16777215) throw Error('Code de trigger invalide.')
    if (seen.has(item.code)) throw Error('Code de trigger défini plusieurs fois : ' + item.code)
    seen.add(item.code)
    if (!item.meaning.trim() || item.meaning.length > 180) throw Error('Signification invalide.')
    const conditions = item.conditions.map(x=>x.trim())
    if (conditions.length > 16 || conditions.some(x=>!x || x.length > 100) ||
        new Set(conditions).size !== conditions.length) throw Error('Groupe de conditions invalide.')
    return { code:item.code, meaning:item.meaning.trim(), conditions }
  }).sort((a,b) => a.code - b.code)
}

export function detectTriggers(rec: LocalRecording, channel: string,
                               minWidthMs = 0, minIntervalMs = 0, tolerance = .25): TriggerPreview {
  const index = rec.info.channels.findIndex(c=>c.name===channel)
  if (index < 0) throw Error('Canal de triggers inconnu.')
  if (!(minWidthMs >= 0 && minWidthMs <= 1000) || !(minIntervalMs >= 0 && minIntervalMs <= 5000) ||
      !(tolerance >= 0 && tolerance <= .49)) throw Error('Paramètres de détection invalides.')
  const values = rec.raw[index], fs = rec.info.sfreq
  const minWidth = Math.max(1, Math.ceil(minWidthMs * fs / 1000))
  const minSpacing = Math.ceil(minIntervalMs * fs / 1000)
  const codeFor = (value: number): number =>
    Number.isFinite(value) && Math.abs(value - Math.round(value)) <= tolerance &&
    value > 0 && value < 16777216 ? Math.round(value) : 0
  const events: MappedTrigger[] = []
  let start = 0, previous = codeFor(values[0]), lastAccepted = -Infinity
  let shortRejected = 0, intervalRejected = 0
  for(let i=1;i<=values.length;i++){
    const current = i<values.length ? codeFor(values[i]) : 0
    if (current === previous) continue
    if (previous !== 0) {
      if (i - start < minWidth) shortRejected++
      else if (start - lastAccepted < minSpacing) intervalRejected++
      else {
        const event: EventMark = { time:Number((start / fs).toFixed(9)),
          duration:Number(((i-start)/fs).toFixed(9)),label:String(previous),
          code:previous,source:'detected:' + channel }
        events.push(mapTrigger(event,rec.info.trigger_definitions||[]))
        lastAccepted = start
        if(events.length > 50000) throw Error('Trop de triggers. Vérifier le canal sélectionné.')
      }
    }
    start=i; previous=current
  }
  const counts: Record<string,number> = {}
  events.forEach(e => { const code=String(e.code);counts[code]=(counts[code]||0)+1 })
  return {events,counts,short_rejected:shortRejected,interval_rejected:intervalRejected,
    source_channel:channel,sampling_rate:fs}
}

export function commitTriggers(rec: LocalRecording, preview: TriggerPreview): LocalRecording {
  const keep = rec.info.events.filter(e=>e.source!==('detected:' + preview.source_channel))
  const fs = rec.info.sfreq
  const additions = preview.events.filter(ev=>!keep.some(original => eventCode(original)===ev.code &&
    Math.abs(Math.round(original.time*fs)-Math.round(ev.time*fs))<=1))
    .map(e=>({time:e.time,duration:e.duration,label:e.label,code:e.code||undefined,source:e.source}))
  const events=[...keep,...additions].sort((a,b)=>a.time-b.time)
  return {...rec,info:{...rec.info,events}}
}

export function conditionEpochs(rec: LocalRecording, channel: string, condition: string,
                                tmin = -.2,tmax = .8, baselineEnd = 0,
                                excludeMarked = false): ConditionEpochs {
  const index=rec.info.channels.findIndex(c=>c.name===channel)
  if(index < 0) throw Error('Canal introuvable.')
  if(!Number.isFinite(tmin)||!Number.isFinite(tmax)||tmin>=tmax||
     baselineEnd<tmin||baselineEnd>tmax) throw Error('Fenêtre d’époquage invalide.')
  const fs=rec.info.sfreq, a=Math.round(tmin*fs),b=Math.round(tmax*fs)
  const n=b-a+1
  if(n<16||n>20000) throw Error('La fenêtre doit contenir 16 à 20 000 échantillons.')
  if(excludeMarked&&(rec.info.bad_channels||[]).includes(channel)) throw Error('Canal marqué pour exclusion.')
  const times=Array.from({length:n},(_,i)=>(a+i)/fs)
  const base=times.map((x,i)=>x>=tmin && x<=baselineEnd ? i:-1).filter(x=>x>=0)
  const accepted:{event:MappedTrigger; row:number[]}[]=[]
  let excludedBounds=0,excludedManual=0
  const def=rec.info.trigger_definitions||[]
  for(const original of rec.info.events){
    const event=mapTrigger(original,def)
    if(condition && !event.conditions.includes(condition)) continue
    const sample=Math.round(event.time*fs),lo=sample+a,hi=sample+b+1
    if(lo<0||hi>rec.info.samples){excludedBounds++;continue}
    if(excludeMarked&&(rec.info.bad_segments||[]).some(segment=>
        segment.start<hi/fs && segment.end>lo/fs)){excludedManual++;continue}
    const row=rec.processed[index].slice(lo,hi)
    if(base.length && baselineEnd>tmin){
      const baseline=base.reduce((sum,i)=>sum+row[i],0)/base.length
      for(let i=0;i<row.length;i++)row[i]-=baseline
    }
    accepted.push({event,row})
    if(accepted.length*n>2000000)throw Error('Époques trop volumineuses : réduire la fenêtre.')
  }
  if(!accepted.length)throw Error('Aucune époque valide pour cette condition.')
  const average=Array.from({length:n},(_,i)=>accepted.reduce((sum,x)=>sum+x.row[i],0)/accepted.length)
  const sem=accepted.length>1?average.map((mean,i)=>Math.sqrt(
    accepted.reduce((total,x)=>total+(x.row[i]-mean)**2,0)/(accepted.length-1))/Math.sqrt(accepted.length)):null
  const stride=Math.max(1,Math.ceil(n*Math.min(accepted.length,200)/100000))
  const counts:Record<string,number>={}
  accepted.forEach(({event})=>{const code=String(event.code);counts[code]=(counts[code]||0)+1})
  return {condition,channel,n:accepted.length,excluded_bounds:excludedBounds,
    excluded_manual:excludedManual,codes:counts,time:times,mean:average,sem,
    trial_time:times.filter((_,i)=>i%stride===0),trials:accepted.slice(0,200)
      .map(({event,row},i)=>({event_index:i,time:event.time,code:event.code,
        meaning:event.meaning,conditions:event.conditions,
        signal:row.filter((_,j)=>j%stride===0)})),
    unit:rec.info.channels[index].unit,baseline:baselineEnd>tmin?[tmin,baselineEnd]:null,
    exclude_marked:excludeMarked}
}

export function eventCSV(rec: LocalRecording): string {
  const mapped=rec.info.events.map(e=>mapTrigger(e,rec.info.trigger_definitions||[]))
  const headers=['onset_s','duration_s','sample','code','label','meaning','conditions','source']
  const esc=(v:string|number)=>'"'+String(v).replace(/"/g,'""')+'"'
  return [headers.join(','),...mapped.map(e=>[
    e.time,e.duration,Math.round(e.time*rec.info.sfreq),e.code||'',e.label,e.meaning,
    e.conditions.join('|'),e.source||'manual'
  ].map(esc).join(','))].join('\n')
}

export function epochCSV(result: ConditionEpochs): string {
  if(result.trials.length<result.n || result.trial_time.length!==result.time.length)
    throw Error('Export complet indisponible depuis cet aperçu. Utiliser le moteur Python.')
  if(result.n*result.time.length>1000000)throw Error('Exporter les époques avec le moteur Python.')
  const rows=['trial_index,condition,code,meaning,onset_s,relative_time_s,amplitude,unit']
  const quote=(v:string|number)=>'"'+String(v).replace(/"/g,'""')+'"'
  result.trials.forEach((trial,i)=>trial.signal.forEach((amplitude,j)=>{
    rows.push([i+1,trial.conditions.join('|'),trial.code||'',trial.meaning,trial.time,
      result.trial_time[j],amplitude,result.unit].map(quote).join(','))
  }))
  return rows.join('\n')
}
