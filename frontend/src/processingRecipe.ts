import type { RecordingInfo, Step } from './types'

/** Portable, sample-free processing protocol for transparent replication.
 * Import is NEVER automatically applied to the current acquisition.
 */
export type ProcessingRecipe={
  schema:'neurocanvas.processing-recipe.v1'
  title:string
  created_at:string
  sampling_rate_hz:number
  channels:{name:string;type:string;unit:string}[]
  steps:Step[]
  caveat:string
}
const methods=new Set(['filter','notch','demean','detrend','rectify','average_reference'])
const record=(v:unknown):v is Record<string,unknown> =>
  !!v&&typeof v==='object'&&!Array.isArray(v)
const finite=(value:unknown):value is number => typeof value==='number'&&Number.isFinite(value)
function validStep(step:unknown,info:RecordingInfo,index:number):Step{
  if(!record(step)||typeof step.method!=='string'||!methods.has(step.method))
    throw Error('Unknown processing method at step '+(index+1))
  if(!Array.isArray(step.channels)||!step.channels.length||
    step.channels.length>info.channels.length||!step.channels.every(x=>typeof x==='string'))
    throw Error('A channel list is required at step '+(index+1))
  const picks=step.channels as string[]
  const channelSet=new Set(info.channels.map(x=>x.name))
  if(new Set(picks).size!==picks.length||picks.some(x=>!channelSet.has(x)))
    throw Error('Recipe contains channels absent from this recording: '+picks.filter(x=>!channelSet.has(x)).join(', '))
  if(picks.some(name=>info.channels.find(c=>c.name===name)?.type==='stim'))
    throw Error('Cannot process TTL/status trigger channels in a reusable recipe.')
  const nyquist=info.sfreq/2
  const method=step.method
  const output:Step={method,channels:[...picks]}
  if(method==='filter'){
    const low=step.low===null||step.low===undefined?null:step.low
    const high=step.high===null||step.high===undefined?null:step.high
    if((low!==null&&(!finite(low)||low<=0||low>=nyquist))||
       (high!==null&&(!finite(high)||high<=0||high>=nyquist))||
       (low===null&&high===null)||
       (low!==null&&high!==null&&low>=high))
      throw Error('Invalid filter cutoffs for current sampling rate at step '+(index+1))
    output.low=low as number|null
    output.high=high as number|null
  }else if(method==='notch'){
    if(!finite(step.frequency)||step.frequency<=0||step.frequency>=nyquist||
       (step.quality!==undefined&&(!finite(step.quality)||step.quality<1||step.quality>1000)))
      throw Error('Invalid notch parameters for current sampling rate at step '+(index+1))
    output.frequency=step.frequency
    output.quality=(step.quality as number|undefined)??30
  }else if(method==='average_reference'){
    if(picks.filter(name=>info.channels.find(ch=>ch.name===name)?.type==='eeg').length<2)
      throw Error('Average EEG reference needs at least two EEG channels.')
  }
  return output
}
export function inspectProcessingRecipe(value:unknown,recording:RecordingInfo):{
  recipe:ProcessingRecipe; steps:Step[];warnings:string[]
}{
  if(!record(value)||value.schema!=='neurocanvas.processing-recipe.v1'||
    typeof value.title!=='string'||!value.title.trim()||value.title.length>120||
    typeof value.created_at!=='string'||!finite(value.sampling_rate_hz)||
    value.sampling_rate_hz<=0||
    !Array.isArray(value.channels)||!Array.isArray(value.steps)||value.steps.length>30)
    throw Error('Invalid or incompatible NeuroCanvas recipe.')
  const channels=value.channels
  if(channels.length>256||channels.some(x=>!record(x)||typeof x.name!=='string'||
    typeof x.type!=='string'||typeof x.unit!=='string'||x.name.length>180))
    throw Error('Invalid recipe channel metadata.')
  const steps=value.steps.map((step,i)=>validStep(step,recording,i))
  const original=channels as {name:string;type:string;unit:string}[]
  const warnings:string[]=[]
  if(Math.abs((value.sampling_rate_hz as number)-recording.sfreq)>1e-6)
    warnings.push('Sampling rate differs: filter cutoffs were checked against current Nyquist, but review parameters manually.')
  for(const used of new Set(steps.flatMap(x=>x.channels||[]))){
    const prior=original.find(c=>c.name===used)
    const current=recording.channels.find(c=>c.name===used)
    if(!prior||!current)continue
    if(prior.type!==current.type||prior.unit!==current.unit)
      warnings.push('Channel '+used+' has changed modality or unit; verify data calibration.')
  }
  return {
    recipe:{
      schema:'neurocanvas.processing-recipe.v1',title:value.title.trim(),
      created_at:value.created_at,sampling_rate_hz:value.sampling_rate_hz,
      channels:original.map(({name,type,unit})=>({name,type,unit})),
      steps,caveat:'Parameters are exploratory; verify filters and results before scientific reporting.'
    },steps,warnings
  }
}
export function createProcessingRecipe(info:RecordingInfo,title='Analysis workflow'):ProcessingRecipe{
  return inspectProcessingRecipe({
    schema:'neurocanvas.processing-recipe.v1',
    title,created_at:new Date().toISOString(),sampling_rate_hz:info.sfreq,
    channels:info.channels.map(c=>({...c})),steps:info.history||[]
  },info).recipe
}
