import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import Plotly from 'plotly.js-dist-min'
import { Activity, Check, Download, FileUp, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { ConditionEpochs, ConditionMetrics, LocalRecording, RecordingInfo,
  TriggerDefinition, TriggerPreview } from './types'
import type { Language } from './localization'
import { api, downloadFromEngine } from './api'
import { commitTriggers, conditionEpochs, detectTriggers, epochCSV, eventCode,
  eventCSV, mapTrigger, validateDefinitions, setLocalTrialDecision } from './triggers'
import { summarizeConditions, metricsCSV } from './conditionMetrics'
import { createAnalysisProtocol, parseAnalysisProtocol } from './analysisProtocol'
import { VisualThemeContext } from './VisualThemeContext'

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
  'Protocole d’analyse':'Analysis protocol',
  'Nom du protocole':'Protocol name',
  'Exporter le protocole':'Export protocol',
  'Importer un protocole':'Import protocol',
  'Protocole importé : confirmer le dictionnaire pour appliquer les correspondances.':
    'Protocol loaded: save the codebook to apply trigger mappings.',
  'Protocole exporté':'Protocol exported',
  'Les protocoles enregistrent les réglages et la signification des triggers, jamais les signaux ou les données personnelles.':
    'Protocols preserve analysis settings and trigger meanings, never samples or personal data.',
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
  'Essais rejetés':'Rejected trials',
  'Essais exclus':'Excluded trials',
  'Revue des essais':'Trial review',
  'Rejet manuel':'Manual rejection',
  'Rejeter cet essai':'Reject this trial',
  'Réhabiliter cet essai':'Restore this trial',
  'Motif du rejet':'Rejection reason',
  'Essai conservé':'Trial included',
  'Essai rejeté':'Trial rejected',
  'Recalculer pour appliquer les modifications.':'Recompute to apply the review changes.',
  'Exclure les essais rejetés':'Exclude manually rejected trials',
  'Aucun essai rejeté':'No trials rejected',
  'Mesures par condition':'Condition measurements',
  'Début mesure (s)':'Measurement start (s)',
  'Fin mesure (s)':'Measurement end (s)',
  'Calculer les mesures':'Compute measurements',
  'Exporter mesures CSV':'Export measurements CSV',
  'Amplitude moyenne':'Mean amplitude',
  'Pic':'Peak',
  'Latence du pic':'Peak latency',
  'Aire signée':'Signed area',
  'Mesures descriptives seulement, sans test statistique.':'Descriptive metrics only, no inferential statistics.',
  'Export des décisions':'Export review decisions',
  'Essais à examiner':'Trials to review',
  'Amplitude crête-à-crête':'Peak-to-peak amplitude',
  'Code trigger':'Trigger code',
  'État':'Status',
  'Veuillez recalculer les époques après une décision.':'Please recompute epochs after a review decision.',
  'Choisir une condition et calculer ses époques pour annoter chaque essai.':
    'Select a condition and compute epochs to review individual trials.',
  'Aucun essai disponible dans la période sélectionnée.':'No trials available in the selected time range.',
  'Carte thermique des essais':'Trial heatmap',
  'Essai individuel':'Single trial',
  'Essais précédents':'Previous trials',
  'Essais suivants':'Next trials',
  'Essais affichés':'Displayed trials',
  'Paramètres du calcul':'Analysis parameters',
  'Moyenne par condition':'Condition average',
  'Époque individuelle':'Single epoch',
  'Exporter les événements CSV':'Export event CSV',
  'Exporter les époques CSV':'Export epoch CSV',
  'Exporter toutes les voies (NPZ)':'Export all channels (NPZ)',
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
  const theme = useContext(VisualThemeContext)
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!el.current) return
    const node = el.current
    void Plotly.react(node, series.map((item,i)=>({
      x,y:item.values,name:item.name,mode:'lines',type:'scattergl',
      line:{color:item.color || ['#1c8265','#ba8552','#5478a8','#ad6887','#8a76b7'][i%5],
        width:item.dash?1:2,dash:item.dash}
    })),{
      height:310,autosize:true,
      paper_bgcolor:theme==='dark'?'#151c2a':'#fff',
      plot_bgcolor:theme==='dark'?'#151c2a':'#fff',
      font:{size:11,color:theme==='dark'?'#adc1dd':'#63786e'},
      margin:{l:65,r:16,t:36,b:55},
      title:{text:title,font:{size:13,color:theme==='dark'?'#e4efff':'#334b42'}},
      xaxis:{title:{text:'Time (s)'},gridcolor:theme==='dark'?'#2e3951':'#e9f0ea'},
      yaxis:{title:{text:yTitle},gridcolor:theme==='dark'?'#2e3951':'#e9f0ea'},
      legend:{orientation:'h',y:-.3}
    },{responsive:true,displaylogo:false})
    return ()=>{Plotly.purge(node)}
  },[x,series,title,yTitle,theme])
  return <div className="trigger-plot" ref={el}/>
}
function EpochHeatmap({ epochs, title }: { epochs: ConditionEpochs; title: string }) {
  const theme=useContext(VisualThemeContext)
  const target=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const node=target.current
    if(!node || !epochs.trials.length)return
    void Plotly.react(node,[{
      type:'heatmap',
      x:epochs.trial_time,
      y:epochs.trials.map(trial=>trial.event_index+1),
      z:epochs.trials.map(trial=>trial.signal),
      colorscale:'RdBu',reversescale:true,
      colorbar:{title:{text:epochs.unit}},
      hovertemplate:'t=%{x:.3f} s<br>trial=%{y}<br>amplitude=%{z:.5g}<extra></extra>'
    }],{
      autosize:true,height:Math.min(560,Math.max(310,epochs.trials.length*4+140)),
      paper_bgcolor:theme==='dark'?'#151c2a':'#fff',
      plot_bgcolor:theme==='dark'?'#151c2a':'#fff',
      title:{text:title,font:{size:13,color:theme==='dark'?'#e4eeff':'#334b42'}},
      margin:{l:70,r:24,t:48,b:52},
      xaxis:{title:{text:'Time (s)'},gridcolor:theme==='dark'?'#2e3951':'#e9f0ea'},
      yaxis:{title:{text:'Trial index'},autorange:'reversed',gridcolor:theme==='dark'?'#2e3951':'#e9f0ea'},
      font:{size:11,color:theme==='dark'?'#adc1dd':'#60736a'}
    },{responsive:true,displaylogo:false})
    return ()=>{Plotly.purge(node)}
  },[epochs,title,theme])
  return <div className="trigger-heatmap" ref={target}/>
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
  const [bitMask,setBitMask]=useState(info.source==='bdf/browser'?'65535':'none')
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
  const [excludeRejected,setExcludeRejected]=useState(false)
  const [reviewReason,setReviewReason]=useState('Artéfact identifié visuellement')
  const [measurementStart,setMeasurementStart]=useState(0)
  const [measurementEnd,setMeasurementEnd]=useState(.3)
  const [metrics,setMetrics]=useState<ConditionMetrics|null>(null)
  const [averaged,setAveraged]=useState<ConditionEpochs|null>(null)
  const [epochSnapshot,setEpochSnapshot]=useState<{
    channel:string;condition:string;tmin:number;tmax:number;baselineEnd:number;
    excludeMarked:boolean;excludeRejected:boolean
  }|null>(null)
  const [comparisons,setComparisons]=useState<ConditionEpochs[]>([])
  const [trialIndex,setTrialIndex]=useState(0)
  const importRef=useRef<HTMLInputElement>(null)
  const protocolRef=useRef<HTMLInputElement>(null)
  const [protocolName,setProtocolName]=useState('Generic event analysis')

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
  const compute=async(compareAll=false, pageOffset=0)=>{
    setBusy(true)
    try{
      const options=pageOffset>0 && epochSnapshot ? epochSnapshot : {
        channel:analysisChannel,condition:viewCondition,tmin,tmax,baselineEnd,
        excludeMarked,excludeRejected
      }
      if(compareAll){
        if(!availableConditions.length)throw Error(t('Aucun dictionnaire de codes.'))
        const batch=await Promise.allSettled(availableConditions.slice(0,12).map(condition=>remote?
          api.triggerEpochs(remote,options.channel,condition,options.tmin,options.tmax,
            options.baselineEnd,options.excludeMarked,options.excludeRejected,0,1):
          Promise.resolve(conditionEpochs(record,options.channel,condition,
            options.tmin,options.tmax,options.baselineEnd,options.excludeMarked,options.excludeRejected,0,1))))
        const output=batch.filter((result):result is PromiseFulfilledResult<ConditionEpochs>=>
          result.status==='fulfilled').map(result=>result.value)
        if(!output.length)throw Error(t('Aucune époque valide pour cette condition.'))
        setComparisons(output);setAveraged(null);setEpochSnapshot(null)
      }else{
        const result=remote?await api.triggerEpochs(remote,options.channel,options.condition,
          options.tmin,options.tmax,options.baselineEnd,options.excludeMarked,
          options.excludeRejected,pageOffset,100):
          conditionEpochs(record,options.channel,options.condition,options.tmin,options.tmax,
            options.baselineEnd,options.excludeMarked,options.excludeRejected,pageOffset,100)
        setAveraged(result);setComparisons([]);setTrialIndex(0);setEpochSnapshot(options)
      }
      success(t('Époques calculées'))
    }catch(e){error(e)}finally{setBusy(false)}
  }
  const exportEvents=()=>{
    if(remote)void downloadFromEngine(api.triggerEventURL(remote),'neurocanvas_triggers.csv').catch(error)
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
      const cfg=epochSnapshot
      if(remote && cfg)void downloadFromEngine(api.triggerEpochURL(remote,cfg.channel,cfg.condition,cfg.tmin,cfg.tmax,
        cfg.baselineEnd,cfg.excludeMarked,cfg.excludeRejected),'neurocanvas_epochs.csv').catch(error)
      else csvDownload('neurocanvas_epochs.csv',epochCSV(averaged))
    }catch(e){error(e)}
  }
  const decideTrial=async(rejected:boolean)=>{
    const trial=averaged?.trials[trialIndex]
    if(!trial?.event_uid){error(t('Aucun essai calculé.'));return}
    setBusy(true)
    try{
      if(remote){
        const result=await api.trialReview(remote,trial.event_uid,rejected,reviewReason)
        setRemoteInfo(result.metadata)
      }else{
        setRecord(old=>setLocalTrialDecision(old,trial.event_uid!,rejected,reviewReason))
      }
      setAveraged(null);setComparisons([]);setMetrics(null)
      success(t('Veuillez recalculer les époques après une décision.'))
    }catch(e){error(e)}finally{setBusy(false)}
  }
  const calculateMetrics=async()=>{
    setBusy(true)
    try{
      const result=remote ? await api.conditionMetrics(remote,analysisChannel,tmin,tmax,
        measurementStart,measurementEnd,baselineEnd,excludeMarked,excludeRejected) :
        summarizeConditions(record,analysisChannel,tmin,tmax,
          measurementStart,measurementEnd,baselineEnd,excludeMarked,excludeRejected)
      setMetrics(result)
      success(t('Mesures par condition'))
    }catch(e){error(e)}finally{setBusy(false)}
  }
  const exportMetrics=()=>{
    if(!metrics){error(t('Calculer les mesures'));return}
    if(remote)void downloadFromEngine(api.conditionMetricsURL(remote,metrics.channel,metrics.tmin,metrics.tmax,
      metrics.measurement_window[0],metrics.measurement_window[1],metrics.baseline_end,
      metrics.exclude_marked,metrics.exclude_rejected),'neurocanvas_condition_metrics.csv').catch(error)
    else csvDownload('neurocanvas_condition_metrics.csv',metricsCSV(metrics))
  }
  const exportReviews=()=>{
    csvDownload('neurocanvas_trial_review.json',JSON.stringify({
      application:'NeuroCanvas',version:'0.4.0',
      recording:info.name,sfreq:info.sfreq,
      decisions:info.trial_decisions||[],
      exclude_rejected:excludeRejected,
      warning:'Manual trial decisions, original samples never modified.'
    },null,2),'application/json')
  }
  const exportProtocol=()=>{
    try{
      const p=createAnalysisProtocol({
        name:protocolName,
        detection:{
          channel:sourceChannel,min_width_ms:widthMs,min_interval_ms:intervalMs,
          tolerance,bit_mask:bitMask==='none'?null:Number(bitMask)
        },
        codebook:validateDefinitions(definitions),
        epoch:{
          channel:analysisChannel,tmin,tmax,baseline_end:baselineEnd,
          measurement_start:measurementStart,measurement_end:measurementEnd,
          exclude_marked:excludeMarked,exclude_rejected:excludeRejected
        }
      })
      csvDownload('neurocanvas_analysis_protocol.json',JSON.stringify(p,null,2),'application/json')
      success(t('Protocole exporté'))
    }catch(e){error(e)}
  }
  const importProtocol=async(file:File)=>{
    try{
      const obj=parseAnalysisProtocol(JSON.parse(await file.text()) as unknown)
      setProtocolName(obj.name)
      const detector=obj.detection
      setSourceChannel(info.channels.some(ch=>ch.name===detector.channel)?
        detector.channel : (info.channels.find(ch=>ch.type==='stim')?.name || sourceChannel))
      setWidthMs(detector.min_width_ms);setIntervalMs(detector.min_interval_ms)
      setTolerance(detector.tolerance);setBitMask(detector.bit_mask===null?
        'none':String(detector.bit_mask))
      setDefinitions(obj.codebook)
      setAnalysisChannel(info.channels.some(ch=>ch.name===obj.epoch.channel)?
        obj.epoch.channel:(info.channels.find(ch=>ch.type==='eeg')?.name||analysisChannel))
      setTmin(obj.epoch.tmin);setTmax(obj.epoch.tmax)
      setBaselineEnd(obj.epoch.baseline_end)
      setMeasurementStart(obj.epoch.measurement_start)
      setMeasurementEnd(obj.epoch.measurement_end)
      setExcludeMarked(obj.epoch.exclude_marked)
      setExcludeRejected(obj.epoch.exclude_rejected)
      setAveraged(null);setMetrics(null);setComparisons([]);setPreview(null)
      success(t('Protocole importé : confirmer le dictionnaire pour appliquer les correspondances.'))
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
      <div className="panel-heading"><div><h3>00 · {t('Protocole d’analyse')}</h3>
        <p>{t('Les protocoles enregistrent les réglages et la signification des triggers, jamais les signaux ou les données personnelles.')}</p></div></div>
      <div className="toolbar">
        <label>{t('Nom du protocole')}<input type="text" value={protocolName}
          maxLength={120} onChange={e=>setProtocolName(e.target.value)}/></label>
        <button className="outline" onClick={exportProtocol}>
          <Download size={15}/>{t('Exporter le protocole')}</button>
        <button className="outline" onClick={()=>protocolRef.current?.click()}>
          <FileUp size={15}/>{t('Importer un protocole')}</button>
        <input type="file" hidden ref={protocolRef} accept=".json,application/json"
          onChange={e=>{const file=e.target.files?.[0];if(file)void importProtocol(file);e.target.value=''}}/>
      </div>
    </section>

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
        <label className="toggle"><input type="checkbox" checked={excludeRejected}
          onChange={e=>setExcludeRejected(e.target.checked)}/>{t('Exclure les essais rejetés')}</label>
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
        {averaged.trials.length>1&&<EpochHeatmap epochs={averaged}
          title={t('Carte thermique des essais')}/>}
        {averaged.trials.length>0&&<><div className="toolbar"><label>{t('Essai individuel')}
          <select value={trialIndex} onChange={e=>setTrialIndex(Number(e.target.value))}>
            {averaged.trials.map((trial,i)=><option value={i} key={i}>
              {i+1} · {trial.meaning} · {trial.time.toFixed(3)} s</option>)}</select></label></div>
          <div className="toolbar trial-pagination">
            <button className="outline" disabled={busy || (averaged.trial_offset||0)===0}
              onClick={()=>void compute(false,Math.max(0,(averaged.trial_offset||0)-100))}>
              {t('Essais précédents')}</button>
            <small>{t('Essais affichés')}: {(averaged.trial_offset||0)+1} –
              {(averaged.trial_offset||0)+averaged.trials.length} / {averaged.n}</small>
            <button className="outline" disabled={busy || averaged.next_offset===null ||
              averaged.next_offset===undefined}
              onClick={()=>void compute(false,averaged.next_offset||0)}>
              {t('Essais suivants')}</button>
          </div>
          <ScientificPlot title={t('Époque individuelle')} x={averaged.trial_time}
            yTitle={averaged.unit} series={[{name:t('Essai individuel'),
              values:averaged.trials[Math.min(trialIndex,averaged.trials.length-1)].signal}]}/>
          <div className="trial-review-card"><div>
            <h4>{t('Revue des essais')}</h4>
            <p>{t('Code trigger')}: {averaged.trials[trialIndex]?.code} ·
              {t('Amplitude crête-à-crête')}: {averaged.trials[trialIndex]?.ptp?.toPrecision(5)} {averaged.unit} ·
              RMS: {averaged.trials[trialIndex]?.rms?.toPrecision(5)} {averaged.unit}</p>
            <p>{averaged.trials[trialIndex]?.review_rejected ?
              t('Essai rejeté') + ': ' + averaged.trials[trialIndex]?.review_reason :
              t('Essai conservé')}</p>
          </div>
            <label>{t('Motif du rejet')}<input aria-label={t('Motif du rejet')}
              value={reviewReason} maxLength={180} onChange={e=>setReviewReason(e.target.value)}/></label>
            <div className="button-row">
              <button className="outline" disabled={busy || !averaged.trials[trialIndex]?.review_rejected}
                onClick={()=>void decideTrial(false)}>{t('Réhabiliter cet essai')}</button>
              <button className="primary" disabled={busy || !averaged.trials[trialIndex]?.event_uid}
                onClick={()=>void decideTrial(true)}>{t('Rejeter cet essai')}</button>
            </div>
          </div></>}
        <button className="primary" onClick={exportEpochs}><Download size={15}/>{t('Exporter les époques CSV')}</button>
        {remote && <button className="outline" onClick={() => void downloadFromEngine(api.triggerNPZURL(
          remote,epochSnapshot?.condition||viewCondition,epochSnapshot?.tmin??tmin,
          epochSnapshot?.tmax??tmax,epochSnapshot?.baselineEnd??baselineEnd,
          epochSnapshot?.excludeMarked??excludeMarked,
          epochSnapshot?.excludeRejected??excludeRejected),
          'neurocanvas_multichannel_epochs.npz').catch(error)}>
          <Download size={15}/>{t('Exporter toutes les voies (NPZ)')}</button>}
        <p className="note">{t('Les essais visibles sont un aperçu ; les exports Python sont en pleine résolution.')}</p>
      </div>}
      {comparisons.length>0&&<><ScientificPlot title={t('Moyenne par condition')} x={comparisons[0].time}
        yTitle={comparisons[0].unit} series={comparisons.map(x=>({name:x.condition+' (n='+x.n+')',values:x.mean}))}/>
        <div className="trigger-chips">{comparisons.map(c=><span key={c.condition}>{c.condition}: {c.n}</span>)}</div></>}
      {!averaged&&!comparisons.length&&<p className="note">{t('Aucun essai calculé.')}</p>}
      <div className="toolbar"><button className="outline" onClick={exportReviews}>
        <Download size={15}/>{t('Export des décisions')}</button>
        <small>{(info.trial_decisions||[]).length} {t('Essais rejetés')}</small></div>
      <p className="note">{t('Données brutes intactes')}</p>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h3>05 · {t('Mesures par condition')}</h3>
        <p>{t('Mesures descriptives seulement, sans test statistique.')}</p></div></div>
      <div className="toolbar">
        <label>{t('Début mesure (s)')}<input type="number" step=".01"
          value={measurementStart} onChange={e=>setMeasurementStart(Number(e.target.value))}/></label>
        <label>{t('Fin mesure (s)')}<input type="number" step=".01"
          value={measurementEnd} onChange={e=>setMeasurementEnd(Number(e.target.value))}/></label>
        <button className="primary" disabled={busy} onClick={()=>void calculateMetrics()}>
          {t('Calculer les mesures')}</button>
        <button className="outline" disabled={!metrics} onClick={exportMetrics}>
          <Download size={15}/>{t('Exporter mesures CSV')}</button>
      </div>
      {metrics&&<div className="trigger-table"><table>
        <thead><tr>
          <th>{t('Condition')}</th><th>N</th><th>{t('Amplitude moyenne')}</th>
          <th>{t('Pic')}</th><th>{t('Latence du pic')}</th>
          <th>{t('Aire signée')}</th><th>{t('Essais exclus')}</th>
        </tr></thead><tbody>{metrics.conditions.map(row=><tr key={row.condition}>
          <td>{row.condition}</td><td>{row.n}</td>
          <td>{row.mean_amplitude?.toPrecision(5)??'—'}</td>
          <td>{row.peak_amplitude?.toPrecision(5)??'—'}</td>
          <td>{row.peak_latency_s?.toFixed(4)??'—'} s</td>
          <td>{row.auc?.toPrecision(5)??'—'}</td>
          <td>{(row.excluded_bounds||0)+(row.excluded_manual||0)+(row.excluded_rejected||0)}</td>
        </tr>)}</tbody></table></div>}
    </section>
  </div>
}
