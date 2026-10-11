import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import Plotly from 'plotly.js-dist-min'
import { Activity, Check, Download, FileUp, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { ConditionEpochs, LocalRecording, RecordingInfo,
  TriggerDefinition, TriggerPreview } from './types'
import type { Language } from './localization'
import { api } from './api'
import { commitTriggers, conditionEpochs, detectTriggers, epochCSV, eventCode,
  eventCSV, mapTrigger, validateDefinitions } from './triggers'

type Props = {
  info: RecordingInfo
  record: LocalRecording
  remote: string | null
  locale: Language
  setRecord: Dispatch<SetStateAction<LocalRecording>>
  setRemoteInfo: Dispatch<SetStateAction<RecordingInfo | null>>
  success: (message: string) => void
  error: (error: unknown) => void
}

const EN: Record<string,string> = {
  'Canal de triggers':'Trigger channel',
  'Masque de bits':'Bit mask',
  'Aucun masque':'No mask',
  'Détection depuis le signal brut':'Detection from raw samples',
  'Largeur minimale (ms)':'Minimum pulse width (ms)',
  'Intervalle minimal (ms)':'Minimum interval (ms)',
  'Tolérance du code':'Code tolerance',
  'Prévisualiser':'Preview triggers',
  'Confirmer les triggers':'Commit triggers',
  'Code':'Code',
  'Signification':'Meaning',
  'Condition(s)':'Condition(s)',
  'Correspondance des codes':'Trigger codebook',
  'Créer une correspondance':'Create mapping',
  'Enregistrer les correspondances':'Save codebook',
  'Condition commune':'Shared condition',
  'Codes sélectionnés':'Selected codes',
  'Regrouper les codes sélectionnés':'Group selected codes',
  'Ajouter un code':'Add code',
  'Supprimer':'Delete',
  'Importer un dictionnaire':'Import codebook',
  'Exporter le dictionnaire':'Export codebook',
  'Événements':'Events',
  'Début (s)':'Onset (s)',
  'Durée (s)':'Duration (s)',
  'Source':'Source',
  'Tous les événements':'All events',
  'Codes détectés':'Detected codes',
  'Triggers confirmés':'Confirmed triggers',
  'Aperçu seulement : rien n’est encore ajouté à la session.':
    'Preview only: nothing has been added to the session.',
  'Époquage par condition':'Epochs by condition',
  'Condition':'Condition',
  'Canal analysé':'Analysis channel',
  'Début relatif (s)':'Relative start (s)',
  'Fin relative (s)':'Relative end (s)',
  'Fin de baseline (s)':'Baseline end (s)',
  'Exclure les artéfacts marqués':'Exclude manually marked artifacts',
  'Calculer les époques':'Compute epochs',
  'Comparer toutes les conditions':'Compare all conditions',
  'Essais retenus':'Included trials',
  'Essais exclus':'Excluded trials',
  'Essai individuel':'Single trial',
  'Moyenne par condition':'Condition average',
  'Époque individuelle':'Single epoch',
  'Exporter les événements CSV':'Export event CSV',
  'Exporter les époques CSV':'Export epoch CSV',
  'Annuler la sélection':'Clear selection',
  'Données brutes intactes':'Raw data unchanged',
  'Les codes d’un groupe sont conservés séparément dans les exports.':
    'Each code in a group is preserved separately in the exports.',
  'Importer un dictionnaire JSON de correspondances de codes.':
    'Import a JSON codebook containing trigger definitions.',
  'Les conditions peuvent regrouper plusieurs codes. Un code peut aussi appartenir à plusieurs conditions.':
    'Conditions can contain multiple codes. One code may belong to multiple conditions.',
  'Sélectionner un canal de stimulation, par exemple Status ou STI 014. Vérifier l’aperçu avant confirmation.':
    'Select a stimulus channel such as Status or STI 014. Check the preview before confirming.',
  'Les impulsions sont détectées sur les valeurs entières positives. Les codes sont lus sur le signal brut.':
    'Pulses are detected as positive integer states. Codes are read from the raw signal.',
  'Aucune exclusion automatique des essais.':
    'No automatic rejection of trials.',
  'Aucun événement disponible.':'No events available.',
  'Aucun dictionnaire de codes.':'No codebook entries.',
  'Tous les codes disponibles':'All available codes',
  'Nouveau code':'New code',
  'Nom de condition':'Condition name',
  'Ajouter':'Add',
  'Chercher un code':'Find a code',
  'Nombre':'Count',
  'Impulsions rejetées':'Rejected pulses',
  'Enregistrer les changements avant l’analyse.':'Save code changes before running the analysis.',
  'Époques calculées':'Epochs computed',
  'Correspondances enregistrées':'Codebook saved',
  'Marqueurs confirmés':'Triggers confirmed',
  'Dictionnaire importé':'Codebook imported',
  'Code supprimé':'Code deleted',
  'Aucun essai calculé.':'No epochs computed.',
  'Aucun code sélectionné.':'No codes selected.',
  'Temps relatif (s)':'Relative time (s)',
  'Amplitude':'Amplitude',
  'Moyenne ± SEM':'Mean ± SEM',
  'Les essais visibles sont un aperçu ; les exports Python sont en pleine résolution.':
    'Displayed trials are a preview; Python exports use full resolution.',
  'Détection et signification des triggers, création de conditions et découpage de signaux':
    'Detect and interpret triggers, build conditions and extract signal epochs'
}

function csvDownload(name: string, data: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}
function ScientificPlot({ x, series, title, yTitle }: {
  x: number[]; series: { name: string; values: number[]; color?: string; dash?: string }[];
  title: string; yTitle: string
}) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!el.current) return
    const node = el.current
    void Plotly.react(node, series.map((item,i)=>({
      x,y:item.values,name:item.name,mode:'lines',type:'scattergl',
      line:{color:item.color || ['#1c8265','#ba8552','#5478a8','#ad6887','#8a76b7'][i%5],
        width:item.dash?1:2,dash:item.dash}
    })),{
      height:310,autosize:true,paper_bgcolor:'#fff',plot_bgcolor:'#fff',
      font:{size:11,color:'#63786e'},margin:{l:65,r:16,t:36,b:55},
      title:{text:title,font:{size:13}},
      xaxis:{title:{text:'Time (s)'},gridcolor:'#e9f0ea'},
      yaxis:{title:{text:yTitle},gridcolor:'#e9f0ea'},
      legend:{orientation:'h',y:-.3}
    },{responsive:true,displaylogo:false})
    return ()=>{Plotly.purge(node)}
  },[x,series,title,yTitle])
  return <div className="trigger-plot" ref={el}/>
}
export default function TriggerStudio({
  info,record,remote,locale,setRecord,setRemoteInfo,success,error
}:Props){
  const t=(label:string)=>locale==='en'?(EN[label] || label):label
  const [sourceChannel,setSourceChannel]=useState(
    ()=>info.channels.find(ch=>/status|stim|trigger|ttl|sti|event/i.test(ch.name))?.name ||
      info.channels[0]?.name || '')
  const [widthMs,setWidthMs]=useState(0)
  const [intervalMs,setIntervalMs]=useState(0)
  const [tolerance,setTolerance]=useState(.25)
  const [bitMask,setBitMask]=useState('none')
  const [preview,setPreview]=useState<TriggerPreview|null>(null)
  const [busy,setBusy]=useState(false)
  const [definitions,setDefinitions]=useState<TriggerDefinition[]>(()=>(info.trigger_definitions||[]).map(d=>({...d})))
  const [selectedCodes,setSelectedCodes]=useState<number[]>([])
  const [newCode,setNewCode]=useState(1)
  const [groupName,setGroupName]=useState('')
  const [viewCondition,setViewCondition]=useState('')
  const [analysisChannel,setAnalysisChannel]=useState(info.channels.find(ch=>ch.type==='eeg')?.name || info.channels[0]?.name || '')
  const [tmin,setTmin]=useState(-.2)
  const [tmax,setTmax]=useState(.8)
  const [baselineEnd,setBaselineEnd]=useState(0)
  const [excludeMarked,setExcludeMarked]=useState(false)
  const [averaged,setAveraged]=useState<ConditionEpochs|null>(null)
  const [comparisons,setComparisons]=useState<ConditionEpochs[]>([])
  const [trialIndex,setTrialIndex]=useState(0)
  const importRef=useRef<HTMLInputElement>(null)

  const codes = useMemo(()=>[...new Set([
    ...info.events.map(e=>eventCode(e)).filter((n):n is number=>n!==null),
    ...(preview?.events.map(e=>e.code).filter((n):n is number=>n!==null)||[]),
    ...definitions.map(d=>d.code)
  ])].sort((a,b)=>a-b),[info.events,preview,definitions])
  const eventList = useMemo(()=>info.events.map(e=>mapTrigger(e,info.trigger_definitions||[])),
    [info.events,info.trigger_definitions])
  const availableConditions=useMemo(()=>[...new Set((info.trigger_definitions||[])
    .flatMap(d=>d.conditions))].sort(),[info.trigger_definitions])
  const filteredEvents=useMemo(()=>viewCondition?eventList.filter(e=>e.conditions.includes(viewCondition)):
    eventList,[eventList,viewCondition])
  const updateRule=(code:number,changes:Partial<TriggerDefinition>)=>{
    setDefinitions(old=>old.map(row=>row.code===code?{...row,...changes}:row))
  }
  const generateRules=()=>{
    setDefinitions(old=>{
      const known=new Set(old.map(d=>d.code))
      return [...old,...codes.filter(c=>!known.has(c)).map(c=>({
        code:c, meaning:'Trigger '+c,conditions:[]
      }))].sort((a,b)=>a.code-b.code)
    })
  }
  const saveCodebook=async (items=definitions)=>{
    setBusy(true)
    try{
      const valid=validateDefinitions(items)
      if(remote)setRemoteInfo(await api.triggerCodebook(remote,valid))
      else setRecord(old=>({...old,info:{...old.info,trigger_definitions:valid}}))
      setDefinitions(valid)
      success(t('Correspondances enregistrées'))
    }catch(e){error(e)}finally{setBusy(false)}
  }
  const previewDetection=async (confirm=false)=>{
    setBusy(true)
    try{
      const result=remote?await api.triggerDetect(remote,sourceChannel,widthMs,intervalMs,tolerance,confirm,
          bitMask==='none'?null:Number(bitMask)):
        detectTriggers(record,sourceChannel,widthMs,intervalMs,tolerance,
          bitMask==='none'?null:Number(bitMask))
      setPreview(result)
      if(confirm){
        if(remote && result.metadata)setRemoteInfo(result.metadata)
        if(!remote)setRecord(old=>commitTriggers(old,result))
        success(t('Marqueurs confirmés')+' : '+(result.commit?.committed ?? result.events.length))
      }
    }catch(e){error(e)}finally{setBusy(false)}
  }
  const groupSelected=()=>{
    const group=groupName.trim()
    if(!group){error(t('Nom de condition'));return}
    if(!selectedCodes.length){error(t('Aucun code sélectionné.'));return}
    setDefinitions(old=>old.map(d=>selectedCodes.includes(d.code)?
      {...d,conditions:[...new Set([...d.conditions,group])]}:d))
    setGroupName('')
    success(t('Enregistrer les changements avant l’analyse.'))
  }
  const compute=async(compareAll=false)=>{
    setBusy(true)
    try{
      if(compareAll){
        if(!availableConditions.length)throw Error(t('Aucun dictionnaire de codes.'))
        const output=await Promise.all(availableConditions.slice(0,12).map(condition=>remote?
          api.triggerEpochs(remote,analysisChannel,condition,tmin,tmax,baselineEnd,excludeMarked):
          Promise.resolve(conditionEpochs(record,analysisChannel,condition,tmin,tmax,baselineEnd,excludeMarked))))
        setComparisons(output);setAveraged(null)
      }else{
        const result=remote?await api.triggerEpochs(remote,analysisChannel,viewCondition,tmin,tmax,baselineEnd,excludeMarked):
          conditionEpochs(record,analysisChannel,viewCondition,tmin,tmax,baselineEnd,excludeMarked)
        setAveraged(result);setComparisons([]);setTrialIndex(0)
      }
      success(t('Époques calculées'))
    }catch(e){error(e)}finally{setBusy(false)}
  }
  const exportEvents=()=>{
    if(remote)window.open(api.triggerEventURL(remote),'_blank','noopener,noreferrer')
    else csvDownload('neurocanvas_triggers.csv',eventCSV(record))
  }
  const exportCodebook=()=>{
    csvDownload('neurocanvas_trigger_codebook.json',JSON.stringify({
      name:info.name,sfreq:info.sfreq,definitions:info.trigger_definitions||[]
    },null,2),'application/json')
  }
  const exportEpochs=()=>{
    if(!averaged){error(t('Aucun essai calculé.'));return}
    try{
      if(remote)window.open(api.triggerEpochURL(remote,analysisChannel,viewCondition,tmin,tmax,
        baselineEnd,excludeMarked),'_blank','noopener,noreferrer')
      else csvDownload('neurocanvas_epochs.csv',epochCSV(averaged))
    }catch(e){error(e)}
  }
  const importCodebook=async (file:File)=>{
    try{
      const data:unknown=JSON.parse(await file.text())
      if(!data||typeof data!=='object'||!('definitions' in data)||
         !Array.isArray(data.definitions))throw Error('Invalid trigger codebook JSON.')
      const rows=validateDefinitions(data.definitions as TriggerDefinition[])
      setDefinitions(rows)
      success(t('Dictionnaire importé'))
    }catch(e){error(e)}
  }
  return <div className="trigger-studio">
    <div className="trigger-intro"><Activity size={23}/><div><strong>Trigger & Epoch Studio</strong>
      <p>{t('Détection et signification des triggers, création de conditions et découpage de signaux')}</p></div>
      <span className="trigger-chip">{remote?'PYTHON':'BROWSER'}</span></div>

    <section className="panel">
      <div className="panel-heading"><div><h3>01 · {t('Détection depuis le signal brut')}</h3>
        <p>{t('Sélectionner un canal de stimulation, par exemple Status ou STI 014. Vérifier l’aperçu avant confirmation.')}</p></div></div>
      <div className="toolbar">
        <label>{t('Canal de triggers')}<select value={sourceChannel} onChange={e=>{setSourceChannel(e.target.value);setPreview(null)}}>
          {info.channels.map(ch=><option key={ch.name} value={ch.name}>{ch.name} · {ch.type}</option>)}</select></label>
        <label>{t('Largeur minimale (ms)')}<input type="number" min="0" max="1000" step=".5" value={widthMs} onChange={e=>setWidthMs(Number(e.target.value))}/></label>
        <label>{t('Intervalle minimal (ms)')}<input type="number" min="0" max="5000" step="1" value={intervalMs} onChange={e=>setIntervalMs(Number(e.target.value))}/></label>
        <label>{t('Tolérance du code')}<input type="number" min="0" max=".49" step=".05" value={tolerance} onChange={e=>setTolerance(Number(e.target.value))}/></label>
        <label>{t('Masque de bits')}<select value={bitMask} onChange={e=>setBitMask(e.target.value)}>
          <option value="none">{t('Aucun masque')}</option>
          <option value="255">0xFF · 8 bits</option>
          <option value="65535">0xFFFF · 16 bits</option>
          <option value="16777215">0xFFFFFF · 24 bits</option>
        </select></label>
        <button className="primary" disabled={busy} onClick={()=>void previewDetection(false)}><Activity size={15}/>{t('Prévisualiser')}</button>
      </div>
      {preview&&<><div className="trigger-stats">
        <div><strong>{preview.events.length}</strong><small>{t('Codes détectés')}</small></div>
        <div><strong>{Object.keys(preview.counts).length}</strong><small>{t('Codes sélectionnés')}</small></div>
        <div><strong>{preview.short_rejected+preview.interval_rejected}</strong><small>{t('Impulsions rejetées')}</small></div>
      </div>
        <div className="trigger-chips">{Object.entries(preview.counts).map(([code,count])=>
          <span key={code}>{code} : {count}</span>)}</div>
        <p className="note">{t('Aperçu seulement : rien n’est encore ajouté à la session.')}</p>
        <button className="primary" disabled={busy||preview.events.length===0} onClick={()=>void previewDetection(true)}>
          <Check size={15}/>{t('Confirmer les triggers')}</button></>}
      <p className="note">{t('Les impulsions sont détectées sur les valeurs entières positives. Les codes sont lus sur le signal brut.')}</p>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h3>02 · {t('Correspondance des codes')}</h3>
        <p>{t('Les conditions peuvent regrouper plusieurs codes. Un code peut aussi appartenir à plusieurs conditions.')}</p></div></div>
      <div className="toolbar">
        <button className="outline" onClick={generateRules}><Plus size={15}/>{t('Créer une correspondance')}</button>
        <label>{t('Nouveau code')}<input type="number" min="1" step="1" max="16777215" value={newCode}
          onChange={e=>setNewCode(Number(e.target.value))}/></label>
        <button className="outline" onClick={()=>{
          if(!Number.isInteger(newCode)||newCode<1||newCode>16777215)return error(t('Nouveau code'))
          if(definitions.some(d=>d.code===newCode))return error('Code already exists')
          setDefinitions(old=>[...old,{code:newCode,meaning:'Trigger '+newCode,conditions:[]}].sort((a,b)=>a.code-b.code))
        }}><Plus size={15}/>{t('Ajouter un code')}</button>
        <button className="outline" onClick={()=>importRef.current?.click()}><FileUp size={15}/>{t('Importer un dictionnaire')}</button>
        <input type="file" hidden ref={importRef} accept=".json,application/json"
          onChange={e=>{const file=e.target.files?.[0];if(file)void importCodebook(file);e.target.value=''}}/>
        <button className="outline" onClick={exportCodebook}><Download size={15}/>{t('Exporter le dictionnaire')}</button>
      </div>
      <div className="trigger-table"><table><thead><tr><th>{t('Codes sélectionnés')}</th><th>{t('Code')}</th>
        <th>{t('Signification')}</th><th>{t('Condition(s)')}</th><th>{t('Supprimer')}</th></tr></thead><tbody>
      {definitions.map(d=><tr key={d.code}><td><input type="checkbox" aria-label={'Sélectionner '+d.code}
        checked={selectedCodes.includes(d.code)} onChange={e=>setSelectedCodes(old=>e.target.checked?
          [...old,d.code]:old.filter(x=>x!==d.code))}/></td><td><strong>{d.code}</strong></td>
        <td><input aria-label={'Signification '+d.code} value={d.meaning} onChange={e=>updateRule(d.code,{meaning:e.target.value})}/></td>
        <td><input aria-label={'Conditions '+d.code} value={d.conditions.join(', ')}
          onChange={e=>updateRule(d.code,{conditions:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}
          placeholder="Visual, Go, Block 1"/></td>
        <td><button className="icon-button" aria-label={'Supprimer code '+d.code}
          onClick={()=>setDefinitions(old=>old.filter(x=>x.code!==d.code))}><Trash2 size={16}/></button></td></tr>)}
      </tbody></table></div>
      {!definitions.length && <p className="note">{t('Aucun dictionnaire de codes.')}</p>}
      <div className="toolbar trigger-group">
        <label>{t('Condition commune')}<input value={groupName} onChange={e=>setGroupName(e.target.value)}
          placeholder={t('Nom de condition')}/></label>
        <button className="outline" disabled={!selectedCodes.length} onClick={groupSelected}>
          <Plus size={15}/>{t('Regrouper les codes sélectionnés')}</button>
        <button className="primary" disabled={busy} onClick={()=>void saveCodebook()}>
          <Check size={15}/>{t('Enregistrer les correspondances')}</button>
      </div>
      <p className="note">{t('Les codes d’un groupe sont conservés séparément dans les exports.')}</p>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h3>03 · {t('Événements')}</h3>
        <p>{info.events.length} {t('Triggers confirmés')} · {availableConditions.length} {t('Condition(s)')}</p></div>
        <button className="outline small" onClick={exportEvents}><Download size={14}/>{t('Exporter les événements CSV')}</button></div>
      <div className="toolbar"><label>{t('Condition')}<select value={viewCondition} onChange={e=>{setViewCondition(e.target.value);setAveraged(null);setComparisons([])}}>
        <option value="">{t('Tous les événements')}</option>
        {availableConditions.map(name=><option key={name} value={name}>{name}</option>)}</select></label></div>
      <div className="trigger-table small"><table><thead><tr><th>{t('Début (s)')}</th><th>{t('Durée (s)')}</th>
        <th>{t('Code')}</th><th>{t('Signification')}</th><th>{t('Condition(s)')}</th><th>{t('Source')}</th></tr></thead>
      <tbody>{filteredEvents.slice(0,300).map((event,i)=><tr key={i}><td>{event.time.toFixed(4)}</td>
        <td>{event.duration.toFixed(4)}</td><td>{event.code ?? '—'}</td><td>{event.meaning}</td>
        <td>{event.conditions.join(' | ')}</td><td>{event.source || 'manual'}</td></tr>)}</tbody></table></div>
      {!filteredEvents.length&&<p className="note">{t('Aucun événement disponible.')}</p>}
      {filteredEvents.length>300&&<p className="note">300 / {filteredEvents.length} preview · CSV: full list</p>}
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h3>04 · {t('Époquage par condition')}</h3>
        <p>{t('Aucune exclusion automatique des essais.')}</p></div></div>
      <div className="toolbar">
        <label>{t('Canal analysé')}<select value={analysisChannel} onChange={e=>setAnalysisChannel(e.target.value)}>
          {info.channels.map(ch=><option key={ch.name} value={ch.name}>{ch.name} · {ch.unit}</option>)}</select></label>
        <label>{t('Début relatif (s)')}<input type="number" step=".05" value={tmin} onChange={e=>setTmin(Number(e.target.value))}/></label>
        <label>{t('Fin relative (s)')}<input type="number" step=".05" value={tmax} onChange={e=>setTmax(Number(e.target.value))}/></label>
        <label>{t('Fin de baseline (s)')}<input type="number" step=".05" value={baselineEnd} onChange={e=>setBaselineEnd(Number(e.target.value))}/></label>
        <label className="toggle"><input type="checkbox" checked={excludeMarked}
          onChange={e=>setExcludeMarked(e.target.checked)}/>{t('Exclure les artéfacts marqués')}</label>
        <button className="primary" disabled={busy} onClick={()=>void compute(false)}>
          <RefreshCw size={15}/>{t('Calculer les époques')}</button>
        <button className="outline" disabled={busy||!availableConditions.length} onClick={()=>void compute(true)}>
          {t('Comparer toutes les conditions')}</button>
      </div>
      {averaged&&<div>
        <div className="trigger-stats"><div><strong>{averaged.n}</strong><small>{t('Essais retenus')}</small></div>
          <div><strong>{averaged.excluded_bounds+averaged.excluded_manual}</strong><small>{t('Essais exclus')}</small></div>
          <div><strong>{Object.keys(averaged.codes).length}</strong><small>{t('Codes détectés')}</small></div></div>
        <ScientificPlot x={averaged.time} title={t('Moyenne par condition')}
          yTitle={averaged.unit} series={[
          {name:t('Moyenne ± SEM'),values:averaged.mean},
          ...(averaged.sem?[{name:'+SEM',values:averaged.mean.map((y,i)=>y+averaged.sem![i]),dash:'dot'},
            {name:'−SEM',values:averaged.mean.map((y,i)=>y-averaged.sem![i]),dash:'dot'}]:[])
        ]}/>
        {averaged.trials.length>0&&<><div className="toolbar"><label>{t('Essai individuel')}
          <select value={trialIndex} onChange={e=>setTrialIndex(Number(e.target.value))}>
            {averaged.trials.map((trial,i)=><option value={i} key={i}>
              {i+1} · {trial.meaning} · {trial.time.toFixed(3)} s</option>)}</select></label></div>
          <ScientificPlot title={t('Époque individuelle')} x={averaged.trial_time}
            yTitle={averaged.unit} series={[{name:t('Essai individuel'),
              values:averaged.trials[Math.min(trialIndex,averaged.trials.length-1)].signal}]}/></>}
        <button className="primary" onClick={exportEpochs}><Download size={15}/>{t('Exporter les époques CSV')}</button>
        <p className="note">{t('Les essais visibles sont un aperçu ; les exports Python sont en pleine résolution.')}</p>
      </div>}
      {comparisons.length>0&&<><ScientificPlot title={t('Moyenne par condition')} x={comparisons[0].time}
        yTitle={comparisons[0].unit} series={comparisons.map(x=>({name:x.condition+' (n='+x.n+')',values:x.mean}))}/>
        <div className="trigger-chips">{comparisons.map(c=><span key={c.condition}>{c.condition}: {c.n}</span>)}</div></>}
      {!averaged&&!comparisons.length&&<p className="note">{t('Aucun essai calculé.')}</p>}
      <p className="note">{t('Données brutes intactes')}</p>
    </section>
  </div>
}
