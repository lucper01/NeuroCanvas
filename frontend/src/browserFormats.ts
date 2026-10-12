/**
 * Offline physiological file readers. No network requests, and no silent scaling.
 * EDF/EDF+/BDF/BDF+: calibrated record-interleaved samples, raw Status words, TAL.
 * BrainVision: .vhdr + .eeg + .vmrk (multiplexed or vectorized binary).
 */
import type { EventMark, LocalRecording, RecordingInfo } from './types'

const MAX_VALUES=6000000, MAX_CHANNELS=256
const latin=new TextDecoder('latin1')
const field=(b:Uint8Array,o:number,n:number)=>latin.decode(b.subarray(o,o+n)).replace(/\0/g,'').trim()
function integer(b:Uint8Array,o:number,n:number,name:string){
  const v=Number(field(b,o,n))
  if(!Number.isSafeInteger(v))throw Error('En-tête invalide : '+name)
  return v
}
function numeric(b:Uint8Array,o:number,n:number,name:string){
  const v=Number(field(b,o,n))
  if(!Number.isFinite(v))throw Error('En-tête invalide : '+name)
  return v
}
const unit=(v:string)=>/^(uv|µv|μv)$/i.test(v)?'µV':v||'a.u.'
const kind=(name:string)=>{
  if(/(status|trigger|stim|trig|ttl|sti\s*\d+)/i.test(name))return 'stim'
  if(/(ecg|ekg|cardiac|heart)/i.test(name))return 'ecg'
  if(/(eda|gsr|scr|skin conductance)/i.test(name))return 'eda'
  if(/(resp|respiration|breath|airflow|rsp)/i.test(name))return 'resp'
  if(/(emg|muscle|zygomatic|corrugator)/i.test(name))return 'emg'
  if(/(eog|heog|veog)/i.test(name))return 'eog'
  if(/^(eeg|fp|af\d|f[cpz\d]|c[z\d]|p[z\d]|o[z\d]|t\d|a\d|b\d)/i.test(name))return 'eeg'
  return 'misc'
}
function result(name:string,fs:number,data:number[][],
  channels:{name:string;type:string;unit:string}[],events:EventMark[],
  warnings:string[],source:string):LocalRecording{
  if(!data.length||!data[0].length)throw Error('Aucun signal importable.')
  if(!Number.isFinite(fs)||fs<=0||fs>100000)throw Error('Fréquence échantillonnage invalide.')
  const length=data[0].length
  const info:RecordingInfo={name,sfreq:fs,samples:length,duration:(length-1)/fs,
    channels,events:events.filter(e=>e.time>=0&&e.time<length/fs),
    history:[],source,warnings}
  return {info,raw:data,processed:data.map(x=>x.slice())}
}
function tal(bytes:Uint8Array,out:EventMark[]){
  for(const entry of latin.decode(bytes).split('\0')){
    if(!entry.includes('\x14'))continue
    const chunks=entry.split('\x14')
    const [onset,duration]=chunks[0].split('\x15')
    if(!/^[+-]?\d+(\.\d+)?$/.test(onset.trim()))continue
    const time=Number(onset),length=duration?Number(duration):0
    if(!Number.isFinite(time)||!Number.isFinite(length)||length<0)continue
    for(const value of chunks.slice(1))if(value.trim())
      out.push({time,duration:length,label:value.trim(),source:'edf-annotation'})
  }
}
export function parseEDFBDF(buffer:ArrayBuffer,filename:string,sourceFileBytes=buffer.byteLength):LocalRecording{
  const bytes=new Uint8Array(buffer),bdf=/\.bdf$/i.test(filename),sampleBytes=bdf?3:2
  if(bytes.length<512)throw Error('Fichier EDF/BDF tronqué : en-tête absent.')
  const head=integer(bytes,184,8,'taille en-tête')
  const recordsHeader=integer(bytes,236,8,'nombre enregistrements')
  const seconds=numeric(bytes,244,8,'durée enregistrement')
  const nchan=integer(bytes,252,4,'canaux')
  const reserved=field(bytes,192,44)
  if(/(EDF|BDF)\+D/i.test(reserved))
    throw Error('EDF+/BDF+ discontinu : utiliser MNE-Python pour préserver les horodatages des segments.')
  if(nchan<=0||nchan>MAX_CHANNELS||head!==256+256*nchan||seconds<=0)
    throw Error('En-tête EDF/BDF non pris en charge : canaux, durée ou taille.')
  if(bytes.length<head)throw Error('En-tête EDF/BDF incomplet.')
  let pos=256
  const list=(width:number)=>{const rows=Array.from({length:nchan},(_,i)=>field(bytes,pos+i*width,width));pos+=nchan*width;return rows}
  const labels=list(16)
  list(80)
  const units=list(8).map(unit)
  const pMin=list(8).map(Number),pMax=list(8).map(Number)
  const dMin=list(8).map(Number),dMax=list(8).map(Number)
  list(80)
  const samples=list(8).map(Number)
  list(32)
  if(pos!==head)throw Error('En-tête EDF/BDF incohérent.')
  const isAnnotation=labels.map(x=>/^(EDF|BDF)\s+Annotations/i.test(x))
  const picks=labels.map((_,i)=>i).filter(i=>!isAnnotation[i])
  if(!picks.length)throw Error('Aucun canal de signal EDF/BDF.')
  const fs=samples[picks[0]]/seconds
  if(!Number.isFinite(fs)||fs<=0||fs>100000)throw Error('Fréquence EDF/BDF invalide.')
  const recordBytes=samples.reduce((a,b)=>a+b,0)*sampleBytes
  if(!Number.isSafeInteger(recordBytes)||recordBytes<=0)throw Error('Taille enregistrement EDF/BDF invalide.')
  const providedRecords=Math.floor((bytes.length-head)/recordBytes)
  const originalRecords=Math.floor((sourceFileBytes-head)/recordBytes)
  const total=recordsHeader===-1?originalRecords:recordsHeader
  if(total<=0||total>originalRecords)throw Error('Échantillons EDF/BDF incomplets ou tronqués.')
  if(picks.some(i=>!Number.isInteger(samples[i])||samples[i]<=0||
    Math.abs(samples[i]/seconds-fs)>1e-7*Math.max(1,fs)))
    throw Error('EDF/BDF contient plusieurs fréquences de canaux : rééchantillonner explicitement avec MNE-Python.')
  if(picks.some(i=>![pMin[i],pMax[i],dMin[i],dMax[i]].every(Number.isFinite)||
    pMin[i]===pMax[i]||dMin[i]===dMax[i]))
    throw Error('Calibration physique-numérique EDF/BDF invalide.')
  const perRecord=samples[picks[0]],all=total*perRecord
  const selected=Math.min(all,Math.floor(MAX_VALUES/picks.length))
  if(selected<=0)throw Error('Mémoire navigateur insuffisante pour les canaux EDF/BDF.')
  const loadedRecords=Math.min(total,Math.ceil(selected/perRecord))
  if(providedRecords<loadedRecords)throw Error('La plage EDF/BDF chargée est tronquée.')
  const warnings:string[]=[]
  if(selected<all)warnings.push(
    'Aperçu tronqué : '+(selected/fs).toFixed(1)+' s chargées sur '+(all/fs).toFixed(1)+' s (limite mémoire navigateur). Le fichier original est intact.')
  const defs=picks.map(i=>({name:labels[i]||'Channel '+(i+1),type:kind(labels[i]),unit:units[i]}))
  const dest=picks.map(()=>new Array<number>(selected))
  const lookup=new Map(picks.map((ch,i)=>[ch,i]))
  const events:EventMark[]=[],view=new DataView(buffer)
  for(let record=0;record<loadedRecords;record++){
    let ptr=head+record*recordBytes
    for(let ch=0;ch<nchan;ch++){
      const count=samples[ch],length=count*sampleBytes
      if(isAnnotation[ch])tal(bytes.subarray(ptr,ptr+length),events)
      else{
        const i=lookup.get(ch)!,out=dest[i],sample0=record*perRecord
        const stim=defs[i].type==='stim'
        const slope=(pMax[ch]-pMin[ch])/(dMax[ch]-dMin[ch])
        const intercept=pMin[ch]-slope*dMin[ch]
        for(let k=0;k<count&&sample0+k<selected;k++){
          const idx=ptr+k*sampleBytes
          let d:number
          if(bdf){
            const u=bytes[idx]|(bytes[idx+1]<<8)|(bytes[idx+2]<<16)
            d=stim?u:(u&0x800000?u-0x1000000:u)
          }else d=view.getInt16(idx,true)
          const v=stim?d:d*slope+intercept
          if(!Number.isFinite(v))throw Error('Amplitude EDF/BDF non finie.')
          out[sample0+k]=v
        }
      }
      ptr+=length
    }
  }
  if(bdf&&defs.some(x=>x.type==='stim'))
    warnings.push('Canal Status BDF : mots numériques bruts 24 bits préservés. Choisir masque 0xFFFF pour les TTL sur les 16 bits faibles.')
  if(isAnnotation.some(Boolean))warnings.push('Annotations EDF+/BDF+ conservées en tant que marqueurs.')
  return result(filename,fs,dest,defs,events,warnings,bdf?'bdf/browser':'edf/browser')
}
type Sections=Record<string,Record<string,string>>
function ini(text:string):Sections{
  const sections:Sections={}
  let section=''
  for(const source of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const line=source.trim()
    if(!line||line.startsWith(';'))continue
    const head=/^\[(.+)\]$/.exec(line)
    if(head){section=head[1].toLowerCase();sections[section]={};continue}
    const sep=line.indexOf('=')
    if(sep>=0&&section)sections[section][line.slice(0,sep).trim().toLowerCase()]=line.slice(sep+1).trim()
  }
  return sections
}
const basename=(x:string)=>x.replace(/\\/g,'/').split('/').pop()!.toLowerCase()
export function parseBrainVision(header:string,eeg:ArrayBuffer,markers:string|null,filename:string):LocalRecording{
  const parts=ini(header),common=parts['common infos']||{},binary=parts['binary infos']||{}
  const chan=parts['channel infos']||{}
  const count=Number(common.numberofchannels),us=Number(common.samplinginterval)
  const layout=(common.dataorientation||'MULTIPLEXED').toUpperCase()
  const format=(binary.binaryformat||'INT_16').toUpperCase()
  if(!Number.isInteger(count)||count<=0||count>MAX_CHANNELS||
    !Number.isFinite(us)||us<=0||!['MULTIPLEXED','VECTORIZED'].includes(layout))
    throw Error('En-tête BrainVision invalide ou orientation non prise en charge.')
  const descriptors=[] as {name:string;type:string;unit:string;gain:number}[]
  for(let i=1;i<=count;i++){
    const fields=(chan['ch'+i]||'').split(',')
    if(!fields[0])throw Error('Description du canal BrainVision Ch'+i+' absente.')
    const gain=fields[2]?Number(fields[2]):1
    if(!Number.isFinite(gain)||gain===0)throw Error('Résolution BrainVision invalide Ch'+i)
    descriptors.push({name:fields[0].trim(),type:kind(fields[0]),gain,unit:unit(fields[3]||'µV')})
  }
  const specs:Record<string,{size:number;read:(data:DataView,idx:number)=>number}>={
    INT_16:{size:2,read:(v,p)=>v.getInt16(p,true)},
    UINT_16:{size:2,read:(v,p)=>v.getUint16(p,true)},
    IEEE_FLOAT_32:{size:4,read:(v,p)=>v.getFloat32(p,true)}
  }
  const spec=specs[format]
  if(!spec)throw Error('Format BrainVision non pris en charge : '+format+'. Utiliser INT_16, UINT_16 ou IEEE_FLOAT_32.')
  if(eeg.byteLength%(count*spec.size)!==0)throw Error('Binaire BrainVision incomplet ou longueur incohérente.')
  const length=eeg.byteLength/(count*spec.size),selected=Math.min(length,Math.floor(MAX_VALUES/count))
  if(!selected)throw Error('Binaire BrainVision vide.')
  const data=descriptors.map(()=>new Array<number>(selected)),view=new DataView(eeg)
  for(let ch=0;ch<count;ch++)for(let j=0;j<selected;j++){
    const pos=(layout==='MULTIPLEXED'?j*count+ch:ch*length+j)*spec.size
    const raw=spec.read(view,pos)
    const value=descriptors[ch].type==='stim'?raw:raw*descriptors[ch].gain
    if(!Number.isFinite(value))throw Error('Amplitude BrainVision non finie.')
    data[ch][j]=value
  }
  const fs=1000000/us
  const warnings:string[]=[]
  if(selected<length)warnings.push('Aperçu BrainVision limité à '+(selected/fs).toFixed(1)+' s sur '+(length/fs).toFixed(1)+' s.')
  const events:EventMark[]=[]
  if(markers!==null){
    const markerIni=ini(markers)['marker infos']||{}
    for(const [key,value] of Object.entries(markerIni)){
      if(!/^mk\d+$/.test(key))continue
      const f=value.split(','),position=Number(f[2]),length=Number(f[3]||1)
      if(!Number.isInteger(position)||position<1||!Number.isFinite(length)||length<0)continue
      const label=f[1]?.trim()||f[0]||'Marker'
      const match=/^(?:S|R|T|Stimulus)?\s*(\d+)$/i.exec(label)
      events.push({time:(position-1)/fs,duration:length/fs,label,
        code:match?Number(match[1]):undefined,source:'brainvision-marker'})
    }
  }else warnings.push('Marqueurs BrainVision absents (.vmrk).')
  return result(filename,fs,data,descriptors.map(({name,type,unit})=>({name,type,unit})),
    events.sort((a,b)=>a.time-b.time),warnings,'brainvision/browser')
}

/** Read only the first N recording blocks. Can open very large original BDF/EDF
    without copying the entire acquisition into the browser's heap. */
async function readEDFFile(file:File):Promise<LocalRecording>{
  const first=new Uint8Array(await file.slice(0,256).arrayBuffer())
  if(first.length<256)throw Error('En-tête EDF/BDF incomplet.')
  const head=integer(first,184,8,'header bytes')
  const nchan=integer(first,252,4,'channels')
  const duration=numeric(first,244,8,'record duration')
  if(nchan<=0||nchan>MAX_CHANNELS||head!==256+256*nchan||duration<=0)
    throw Error('En-tête EDF/BDF invalide.')
  const header=new Uint8Array(await file.slice(0,head).arrayBuffer())
  if(header.length<head)throw Error('En-tête EDF/BDF tronqué.')
  const names=Array.from({length:nchan},(_,i)=>field(header,256+i*16,16))
  const sampleStart=256+216*nchan
  const sampleCounts=Array.from({length:nchan},(_,i)=>Number(field(header,sampleStart+i*8,8)))
  if(sampleCounts.some(n=>!Number.isSafeInteger(n)||n<=0))
    throw Error('Nombre d’échantillons EDF/BDF invalide.')
  const channelCount=names.filter(name=>!/^(EDF|BDF)\s+Annotations/i.test(name)).length
  if(!channelCount)throw Error('Aucun canal de signal.')
  const recordBytes=sampleCounts.reduce((sum,n)=>sum+n,0)*(/\.bdf$/i.test(file.name)?3:2)
  if(!Number.isSafeInteger(recordBytes)||recordBytes<=0)throw Error('Taille de bloc EDF/BDF invalide.')
  const reportedRecords=integer(header,236,8,'records')
  const sourceRecords=reportedRecords===-1?
    Math.floor((file.size-head)/recordBytes):reportedRecords
  if(sourceRecords<=0||file.size<head+sourceRecords*recordBytes)
    throw Error('Enregistrement EDF/BDF tronqué sur le disque.')
  const maxSamples=Math.floor(MAX_VALUES/channelCount)
  const recordsToRead=Math.min(sourceRecords,Math.ceil(maxSamples/sampleCounts[
    names.findIndex(name=>!/^(EDF|BDF)\s+Annotations/i.test(name))
  ]))
  const sampledFile=await file.slice(0,head+recordsToRead*recordBytes).arrayBuffer()
  return parseEDFBDF(sampledFile,file.name,file.size)
}
async function readTextFile(file:File):Promise<string>{
  const buffer=await file.arrayBuffer()
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer)}
  catch{return new TextDecoder('windows-1252').decode(buffer)}
}
async function readBrainVisionFiles(files:File[],headFile:File):Promise<LocalRecording>{
  const header=await readTextFile(headFile)
  const metadata=ini(header),common=metadata['common infos']||{},binary=metadata['binary infos']||{}
  const count=Number(common.numberofchannels)
  if(!Number.isInteger(count)||count<=0||count>MAX_CHANNELS)
    throw Error('Nombre de canaux BrainVision invalide.')
  const format=(binary.binaryformat||'INT_16').toUpperCase()
  const bytesPerSample:Record<string,number>={INT_16:2,UINT_16:2,IEEE_FLOAT_32:4}
  const bytes=bytesPerSample[format]
  if(!bytes)throw Error('Format BrainVision non pris en charge : '+format)
  const filename=basename(common.datafile||'')
  const markName=basename(common.markerfile||'')
  const dataFile=files.find(f=>basename(f.name)===filename)
  const markersFile=files.find(f=>basename(f.name)===markName)
  if(!dataFile)throw Error('BrainVision : sélectionner ensemble les fichiers .vhdr et .eeg associés.')
  if(markName&&!markersFile)throw Error('BrainVision : fichier .vmrk manquant. Sélectionner les trois fichiers associés.')
  if(dataFile.size%(count*bytes)!==0)
    throw Error('Binaire BrainVision incomplet ou incompatible avec le nombre de canaux.')
  const originalLength=dataFile.size/(count*bytes)
  const selected=Math.min(originalLength,Math.floor(MAX_VALUES/count))
  if(!selected)throw Error('Fichier BrainVision vide.')
  const orientation=(common.dataorientation||'MULTIPLEXED').toUpperCase()
  let buffer:ArrayBuffer
  if(orientation==='MULTIPLEXED')buffer=await dataFile.slice(0,selected*count*bytes).arrayBuffer()
  else if(orientation==='VECTORIZED'){
    const blocks=await Promise.all(Array.from({length:count},(_,i)=>
      dataFile.slice(i*originalLength*bytes,i*originalLength*bytes+selected*bytes).arrayBuffer()))
    const compact=new Uint8Array(selected*count*bytes)
    blocks.forEach((part,i)=>compact.set(new Uint8Array(part),i*selected*bytes))
    buffer=compact.buffer
  }else throw Error('Orientation BrainVision non prise en charge : '+orientation)
  const rec=parseBrainVision(header,buffer,markersFile?await readTextFile(markersFile):null,headFile.name)
  if(selected<originalLength)rec.info.warnings.unshift(
    'Aperçu BrainVision tronqué à '+(selected/rec.info.sfreq).toFixed(1)+' s sur '+
    (originalLength/rec.info.sfreq).toFixed(1)+' s. Le fichier original est intact.')
  return rec
}
export async function importScientificFiles(files:File[]):Promise<LocalRecording>{
  if(!files.length)throw Error('Aucun fichier sélectionné.')
  const main=files.find(f=>/\.(bdf|edf|vhdr)$/i.test(f.name))
  if(!main)throw Error('Mode navigateur : EDF, BDF, BrainVision (.vhdr/.eeg/.vmrk), CSV et TSV. FIF, SET et ACQ requièrent le moteur Python local.')
  if(/\.(bdf|edf)$/i.test(main.name))return readEDFFile(main)
  return readBrainVisionFiles(files,main)
}
