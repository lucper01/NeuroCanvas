/** Offline inventory from binary headers ONLY. Never reads or transmits
 * signal sample arrays. "Partial" denotes incomplete scientific metadata,
 * not missing or altered source files.
 */
export type InventoryItem={
  index:number; filename:string; format:string; size_bytes:number
  channels:number|null; sampling_hz:number|null; duration_s:number|null
  samples_per_channel:number|null; has_event_channel:boolean|null
  status:'readable'|'partial'|'python'|'invalid'
  companion_files:string[]
  warnings:string[]
}
const latin=new TextDecoder('latin1')
const decode=(bytes:Uint8Array,start:number,length:number)=>
  latin.decode(bytes.subarray(start,start+length)).replace(/\0/g,'').trim()
const integer=(value:string):number|null=>{
  const number=Number(value)
  return value.trim()!==''&&Number.isSafeInteger(number)?number:null
}
const float=(value:string):number|null=>{
  const number=Number(value)
  return value.trim()!==''&&Number.isFinite(number)?number:null
}
const ext=(name:string)=>(name.split('.').pop()||'').toLowerCase()
const base=(value:string)=>value.replace(/\\/g,'/').split('/').pop()?.toLowerCase()||''
const asText=async(file:File,length:number)=>{
  const bytes=await file.slice(0,length).arrayBuffer()
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
  catch{return new TextDecoder('windows-1252').decode(bytes)}
}
function summaryItem(index:number,file:File):InventoryItem{
  return {index,filename:file.webkitRelativePath||file.name,
    format:ext(file.name).toUpperCase(),size_bytes:file.size,
    channels:null,sampling_hz:null,duration_s:null,
    samples_per_channel:null,has_event_channel:null,
    status:'partial',companion_files:[],warnings:[]}
}
async function edfHeader(file:File,index:number):Promise<InventoryItem>{
  const result=summaryItem(index,file)
  const first=new Uint8Array(await file.slice(0,256).arrayBuffer())
  if(first.length<256)throw Error('Truncated EDF/BDF fixed header.')
  const n=integer(decode(first,252,4)),head=integer(decode(first,184,8))
  const seconds=float(decode(first,244,8)),records=integer(decode(first,236,8))
  if(n===null||n<1||n>256||head!==256+256*n||seconds===null||seconds<=0||records===null)
    throw Error('Invalid EDF/BDF header dimensions or record duration.')
  const header=new Uint8Array(await file.slice(0,head).arrayBuffer())
  if(header.length<head)throw Error('Truncated EDF/BDF channel descriptors.')
  const labels=Array.from({length:n},(_,i)=>decode(header,256+i*16,16))
  const spStart=256+216*n
  const rates=Array.from({length:n},(_,i)=>
    integer(decode(header,spStart+i*8,8)))
  if(rates.some(x=>x===null||x<=0))throw Error('Invalid sample counts per record.')
  const samples=rates as number[]
  const bytesPerSample=ext(file.name)==='bdf'?3:2
  const blockBytes=samples.reduce((a,b)=>a+b,0)*bytesPerSample
  if(!Number.isSafeInteger(blockBytes)||blockBytes<1)
    throw Error('Invalid EDF/BDF record byte count.')
  const available=Math.floor((file.size-head)/blockBytes)
  const total=records===-1?available:records
  if(total<1||available<total)throw Error('EDF/BDF data portion is incomplete.')
  const signalIndices=labels.map((_,i)=>i).filter(i=>!/^(EDF|BDF)\s+Annotations/i.test(labels[i]))
  if(!signalIndices.length)throw Error('No signal channels in EDF/BDF.')
  result.channels=signalIndices.length
  const fs=samples[signalIndices[0]]/seconds
  const multipleRates=signalIndices.some(i=>Math.abs(samples[i]/seconds-fs)>1e-6*Math.max(1,fs))
  result.sampling_hz=multipleRates?null:fs
  result.samples_per_channel=multipleRates?null:samples[signalIndices[0]]*total
  result.duration_s=seconds*total
  result.has_event_channel=labels.some(name=>/(status|trigger|stim|trig|ttl)/i.test(name))||
    labels.some(name=>/^(EDF|BDF)\s+Annotations/i.test(name))
  const reserved=decode(first,192,44)
  const discontinuous=/(EDF|BDF)\+D/i.test(reserved)
  if(discontinuous){
    result.duration_s=null
    result.warnings.push('Discontinuous EDF+/BDF+: elapsed duration is unknown from this header; use MNE for accurate time axes.')
  }
  if(multipleRates)result.warnings.push('Multiple channel rates: explicit resampling needed for browser analysis.')
  if(file.size-head>total*blockBytes)result.warnings.push('Trailing bytes not included in stated record count.')
  result.status=discontinuous||multipleRates?'partial':'readable'
  return result
}
function parseHeader(text:string){
  const sections:Record<string,Record<string,string>>={}
  let section=''
  for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const row=line.trim()
    if(!row||row.startsWith(';'))continue
    const m=/^\[(.+)\]$/.exec(row)
    if(m){section=m[1].toLowerCase();sections[section]={};continue}
    const pos=row.indexOf('=')
    if(pos>=0&&section)sections[section][row.slice(0,pos).trim().toLowerCase()]=row.slice(pos+1).trim()
  }
  return sections
}
async function brainVisionHeader(file:File,index:number,files:File[]):Promise<InventoryItem>{
  const result=summaryItem(index,file)
  const metadata=parseHeader(await asText(file,512*1024))
  const common=metadata['common infos']||{}
  const binary=metadata['binary infos']||{}
  const channelCount=integer(common.numberofchannels||'')
  const interval=float(common.samplinginterval||'')
  const fmt=(binary.binaryformat||'INT_16').toUpperCase()
  const width:Record<string,number>={INT_16:2,UINT_16:2,IEEE_FLOAT_32:4}
  if(!channelCount||channelCount>256||!interval||interval<=0)
    throw Error('Invalid BrainVision channel count or sample interval.')
  result.channels=channelCount
  result.sampling_hz=1000000/interval
  const eegName=base(common.datafile||''),markerName=base(common.markerfile||'')
  const eeg=files.find(x=>base(x.name)===eegName)
  const marker=files.find(x=>base(x.name)===markerName)
  if(eeg)result.companion_files.push(eeg.name)
  else result.warnings.push('Companion EEG binary file missing: '+(eegName||'[unspecified]'))
  if(markerName){
    if(marker)result.companion_files.push(marker.name)
    else result.warnings.push('Referenced VMRK event file missing: '+markerName)
  }
  result.has_event_channel=!!marker
  if(!width[fmt])result.warnings.push('Unsupported BrainVision binary format: '+fmt)
  if(eeg&&width[fmt]){
    const bytesPerFrame=width[fmt]*channelCount
    if(eeg.size%bytesPerFrame!==0)result.warnings.push('EEG binary byte length inconsistent with channel count.')
    else {
      result.samples_per_channel=eeg.size/bytesPerFrame
      result.duration_s=result.samples_per_channel/result.sampling_hz
    }
  }
  result.status=result.warnings.length?'partial':'readable'
  return result
}
function parseCSVHeader(line:string,separator:string):string[]{
  const values:string[]=[]
  let token='',quoted=false
  for(let i=0;i<line.length;i++){
    const ch=line[i]
    if(ch==='"'){
      if(quoted&&line[i+1]==='"'){token+='"';i++}
      else quoted=!quoted
    }else if(ch===separator&&!quoted){values.push(token.trim());token=''}
    else token+=ch
  }
  if(quoted)throw Error('Unterminated quoted CSV header.')
  values.push(token.trim())
  return values
}
async function csvHeader(file:File,index:number):Promise<InventoryItem>{
  const result=summaryItem(index,file)
  const text=await asText(file,128*1024)
  const line=text.replace(/^\uFEFF/,'').split(/\r?\n/)[0]||''
  if(!line)throw Error('Empty CSV/TSV header.')
  const separator=ext(file.name)==='tsv'?'\t':[';',',','\t']
    .sort((a,b)=>parseCSVHeader(line,b).length-parseCSVHeader(line,a).length)[0]
  const fields=parseCSVHeader(line,separator)
  const timeColumn=fields.some(x=>/^(time|time_s|seconds|timestamp_s|time \(s\)|t)$/i.test(x))
  result.channels=Math.max(0,fields.length-(timeColumn?1:0))
  if(result.channels===0)throw Error('No signal columns in header.')
  result.has_event_channel=fields.some(x=>/^(status|trigger|ttl|stim)/i.test(x))
  result.status='partial'
  result.warnings.push('Header-only CSV scan: sampling frequency, row count and total duration not inferred.')
  return result
}
async function one(file:File,index:number,files:File[]):Promise<InventoryItem>{
  const e=ext(file.name),row=summaryItem(index,file)
  try{
    if(e==='edf'||e==='bdf')return await edfHeader(file,index)
    if(e==='vhdr')return await brainVisionHeader(file,index,files)
    if(e==='csv'||e==='tsv')return await csvHeader(file,index)
    if(['eeg','vmrk'].includes(e)){
      row.status='partial'
      row.warnings.push('Companion file; select the matching .vhdr to inspect BrainVision metadata.')
    }else if(['fif','set','acq','zip'].includes(e)){
      row.status='python'
      row.warnings.push('MNE/bioread or local Python is required to inspect this format.')
    }else{
      row.status='invalid'
      row.warnings.push('Unsupported extension; original file was not modified.')
    }
    return row
  }catch(e){
    row.status='invalid'
    row.warnings.push(e instanceof Error?e.message:String(e))
    return row
  }
}
export async function scanDatasetInventory(files:File[]):Promise<InventoryItem[]>{
  if(files.length<1||files.length>150)throw Error('Select between 1 and 150 files per batch.')
  // Scan metadata only; never materialize a complete acquisition in memory.
  const output:InventoryItem[]=[]
  for(let i=0;i<files.length;i++)output.push(await one(files[i],i,files))
  return output
}
function quote(v:string|number|null):string{
  let value=String(v===null?'':v)
  if(/^[=+\-@\t\r]/.test(value))value="'"+value
  return /[",\r\n]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value
}
export function inventoryCSV(rows:InventoryItem[],redactNames=true):string{
  const result=['file,format,size_bytes,channels,sampling_hz,duration_s,samples_per_channel,event_marker,status,companion_files,warnings']
  for(const row of rows){
    const fields=[redactNames?'file_'+(row.index+1):row.filename,row.format,row.size_bytes,
      row.channels,row.sampling_hz,row.duration_s,row.samples_per_channel,
      row.has_event_channel===null?'unknown':String(row.has_event_channel),
      row.status,redactNames?String(row.companion_files.length):row.companion_files.join('; '),
      row.warnings.join(' | ')]
    result.push(fields.map(v=>quote(v as string|number|null)).join(','))
  }
  return result.join('\r\n')
}
export function inventoryJSON(rows:InventoryItem[],redactNames=true):string{
  return JSON.stringify({
    schema:'neurocanvas.dataset-inventory.v1',created_at:new Date().toISOString(),
    files:rows.map(row=>({...row,filename:redactNames?'file_'+(row.index+1):row.filename,
      companion_files:redactNames?[]:row.companion_files})),
    note:'Header-only metadata inventory; no physiological samples read or exported.'
  },null,2)
}
