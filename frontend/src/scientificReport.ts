import type { RecordingInfo, QCReport, Step } from './types'
import { summarizeQuality } from './qualityMatrix'

export type AuditData={
  info:RecordingInfo
  qc:QCReport|null
  engine:string
  generated_at:string
  anonymize_filename:boolean
  has_truncated_preview:boolean
}
export function buildAuditData(info:RecordingInfo,qc:QCReport|null,
  engine:string,anonymizeFilename=true):AuditData{
  const allowed = info.warnings||[]
  return {
    info:{
      ...info,
      name:anonymizeFilename?'[redacted recording name]':info.name,
      // Event times are retained for scientific audit but not participant data.
      // Never copy raw samples, CSV values or arbitrary private files.
      channels:info.channels.map(c=>({...c})),
      events:info.events.map(ev=>({...ev})),
      history:info.history.map((step:Step)=>({...step,channels:[...(step.channels||[])]})),
      warnings:[...allowed]
    },
    qc,engine,generated_at:new Date().toISOString(),
    anonymize_filename:anonymizeFilename,
    has_truncated_preview:allowed.some(x=>/(tronqu|truncat|aperçu|preview|limite mémoire|bounded)/i.test(x))
  }
}
function esc(value:unknown):string{
  return String(value??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;')
}
function num(v:number|null|undefined,decimals=3):string{
  return v!==undefined&&v!==null&&Number.isFinite(v)?v.toFixed(decimals):'—'
}
function table(header:string[],rows:(string|number|boolean|null|undefined)[][]):string{
  return '<div class="table-scroll"><table><thead><tr>'+header.map(x=>'<th>'+esc(x)+'</th>').join('')+
    '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+
    '</tr>').join('')+'</tbody></table></div>'
}
function eventCodeCounts(info:RecordingInfo):[string,number][]{
  const map=new Map<string,number>()
  for(const ev of info.events){
    const key=ev.code!==undefined ? String(ev.code)+' · '+ev.label : ev.label
    map.set(key,(map.get(key)||0)+1)
  }
  return [...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
}
export function auditJSON(data:AuditData):string{
  return JSON.stringify({
    schema:'neurocanvas.audit-report.v1',
    ...data,
    qc_summary:data.qc?summarizeQuality(data.qc):null,
    note:'Descriptive audit only; not a validated physiological diagnosis. Original samples are not included.'
  },null,2)
}
export function auditHTML(data:AuditData,locale:'fr'|'en'='fr'):string{
  const fr=locale==='fr',info=data.info,qc=data.qc,summary=qc?summarizeQuality(qc):[]
  const tr=(a:string,b:string)=>fr?a:b
  const totalFlag=summary.reduce((a,x)=>a+x.flagged,0)
  const totalWindows=summary.reduce((a,x)=>a+x.windows,0)
  const warnings=info.warnings||[]
  const steps=info.history||[]
  const labels=eventCodeCounts(info)
  const sections=[
    '<section class="hero"><span class="eyebrow">NEUROCANVAS · SCIENTIFIC AUDIT</span>'+
      '<h1>'+esc(tr('Rapport d’analyse','Analysis report'))+'</h1>'+
      '<p>'+esc(tr('Édition descriptive non diagnostique','Descriptive, non-diagnostic edition'))+'</p>'+
      '<div class="stats">'+[
        [tr('Voies','Channels'),info.channels.length],
        [tr('Fréquence','Sampling'),num(info.sfreq)+' Hz'],
        [tr('Durée','Duration'),num(info.duration)+' s'],
        [tr('Événements','Events'),info.events.length],
        [tr('Fenêtres QC suspectes','Flagged QC windows'),qc?totalFlag+'/'+totalWindows:tr('Non calculé','Not computed')]
      ].map(([k,v])=>'<div><small>'+esc(k)+'</small><b>'+esc(v)+'</b></div>').join('')+'</div></section>',
    '<section><h2>'+esc(tr('Acquisition et provenance','Recording & provenance'))+'</h2>'+
      table([tr('Paramètre','Parameter'),tr('Valeur','Value')],[
        [tr('Nom','Name'),info.name],[tr('Source','Source'),info.source],
        [tr('Échantillons / voie','Samples per channel'),info.samples],
        [tr('Moteur','Engine'),data.engine],
        [tr('Génération','Generated at'),data.generated_at],
        [tr('Aperçu tronqué','Truncated preview'),data.has_truncated_preview?'YES':'NO'],
        [tr('Nom anonymisé','Name redacted'),data.anonymize_filename?'YES':'NO']
      ])+'</section>',
    '<section><h2>'+esc(tr('Capteurs et unités','Sensors & units'))+'</h2>'+
      table([tr('Canal','Channel'),tr('Modalité','Type'),tr('Unité','Unit')],
        info.channels.map(c=>[c.name,c.type,c.unit]))+'</section>',
    '<section><h2>'+esc(tr('Pipeline de traitement','Processing pipeline'))+'</h2>'+
      (steps.length?table(['#',tr('Méthode','Method'),tr('Canaux','Channels'),tr('Paramètres','Parameters')],
        steps.map((s,i)=>[i+1,s.method,(s.channels||[]).join(', '),
          Object.entries(s).filter(([k])=>!['method','channels'].includes(k)).map(([k,v])=>k+'='+String(v)).join('; ')])):
        '<p>'+esc(tr('Aucune opération enregistrée.','No processing step recorded.'))+'</p>')+'</section>',
    '<section><h2>'+esc(tr('Événements','Events'))+'</h2>'+
      (labels.length?table([tr('Code / étiquette','Code / label'),tr('Effectif','Count')],labels):
        '<p>'+esc(tr('Aucun événement.','No event available.'))+'</p>')+'</section>',
    '<section><h2>'+esc(tr('Contrôle qualité par canal','Channel-level quality review'))+'</h2>'+
      (qc?'<p>'+esc(tr('Fenêtres','Windows'))+': '+num(qc.window_seconds,2)+' s. '+
        esc(qc.warning)+'</p>'+
        table([tr('Canal','Channel'),tr('Fenêtres','Windows'),tr('Amplitude élevée','High amplitude'),
            tr('Plat','Flat'),tr('Marqué','Manual'),tr('Suspect','Flagged'),tr('Canal exclu','Channel marked bad')],
          summary.map(q=>[q.channel,q.windows,q.high,q.flat,q.manual,q.flagged,q.marked_bad?'YES':'NO'])):
        '<p>'+esc(tr('Dépistage QC non calculé.','QC screening not calculated.'))+'</p>')+'</section>',
    '<section><h2>'+esc(tr('Décisions manuelles','Manual decisions'))+'</h2>'+
      '<p>'+esc(tr('Canaux déclarés problématiques','Manually marked bad channels'))+': '+
      esc((info.bad_channels||[]).join(', ')||'—')+'</p>'+
      (info.bad_segments?.length?table([tr('Début (s)','Start (s)'),tr('Fin (s)','End (s)'),tr('Justification','Reason')],
        info.bad_segments.map(x=>[num(x.start),num(x.end),x.reason])):
        '<p>'+esc(tr('Aucun segment exclu.','No manually marked segment.'))+'</p>')+
      '<p>'+esc(tr('Décisions d’essais','Trial decisions'))+': '+esc((info.trial_decisions||[]).length)+'</p></section>',
    '<section><h2>'+esc(tr('Avertissements et limites','Warnings & limitations'))+'</h2>'+
      (warnings.length?'<ul>'+warnings.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p>—</p>')+
      '<p><strong>'+esc(tr('Interprétation','Interpretation'))+':</strong> '+
        esc(tr('Les indicateurs QC reposent sur des heuristiques relatives à chaque canal. Aucune exclusion n’est automatique et aucune inférence clinique ne doit être déduite de ce rapport. Les mesures doivent être validées avant publication.',
        'QC indicators rely on within-channel relative heuristics. No trial is automatically excluded and no clinical inference can be made from this report. Validate all measurements before publication.'))+'</p></section>'
  ]
  return '<!doctype html><html lang="'+(fr?'fr':'en')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="generator" content="NeuroCanvas 0.6"><title>'+esc(tr('Rapport NeuroCanvas','NeuroCanvas report'))+'</title>'+
    '<style>*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;color:#202d40;background:#f4f7fb;'+
    'max-width:1050px;margin:auto;padding:32px;line-height:1.55}h1{font-size:2.5rem;margin:12px 0}h2{font-size:1.2rem}'+
    '.hero,section{background:#fff;border:1px solid #dce5ee;border-radius:16px;padding:24px;margin-bottom:20px}'+
    '.hero{background:#17223a;color:#eff8ff}.hero p{color:#a5b8d2}.eyebrow{font-size:11px;letter-spacing:2px;color:#9dcaff}'+
    '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-top:25px}.stats div{'+
    'background:#2a3a54;padding:14px;border-radius:10px}.stats small{display:block;color:#c1cee3}.stats b{font-size:20px}'+
    'table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:9px;text-align:left;border-bottom:1px solid #e3eaf0}'+
    'th{background:#eef2f9}tr:nth-child(even){background:#fbfcff}.table-scroll{overflow:auto}'+
    'ul{padding-left:20px}li{margin-bottom:7px}p{overflow-wrap:anywhere}'+
    '@media print{body{background:white;padding:0}section{break-inside:avoid;box-shadow:none;border:1px solid #cbd5e0}'+
    '.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'+
    '</style></head><body>'+sections.join('')+'<footer>NeuroCanvas · '+esc(data.generated_at)+'</footer></body></html>'
}
