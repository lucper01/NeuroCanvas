import { describe, expect, it } from 'vitest'
import { importScientificFiles, parseEDFBDF, parseBrainVision } from './browserFormats'

const enc=new TextEncoder()
function put(bytes:Uint8Array, offset:number, width:number, str:string){
  const b=enc.encode(str)
  if(b.length>width)throw Error('Test field too long')
  bytes.fill(32,offset,offset+width)
  bytes.set(b,offset)
}
type FixtureOptions={bdf?:boolean;annotations?:boolean;discontinuous?:boolean;ratesDiffer?:boolean}
function makeEDF(opts:FixtureOptions={}):ArrayBuffer{
  const bdf=!!opts.bdf,annotation=!!opts.annotations
  const labels=annotation?['Cz','EDF Annotations']:['Cz','Status']
  const channels=labels.length, width=bdf?3:2,ns=[4,annotation?40:(opts.ratesDiffer?8:4)]
  const headerSize=256+256*channels
  const records=2,recordBytes=ns.reduce((a,b)=>a+b)*width
  const bytes=new Uint8Array(headerSize+records*recordBytes)
  put(bytes,0,8,bdf?'BIOSEMI':'0')
  put(bytes,8,80,'TEST')
  put(bytes,88,80,'Synthetic fixture')
  put(bytes,168,8,'01.01.25')
  put(bytes,176,8,'12.00.00')
  put(bytes,184,8,String(headerSize))
  put(bytes,192,44,opts.discontinuous?'EDF+D':annotation?'EDF+C':'')
  put(bytes,236,8,String(records))
  put(bytes,244,8,'1')
  put(bytes,252,4,String(channels))
  let pos=256
  const lists=[
    [16,labels],[80,['','']],[8,['uV',annotation?'':bdf?'':'code']],
    [8,['-100','-100']],[8,['100','100']],
    [8,[bdf?'-8388608':'-32768',bdf?'-8388608':'-32768']],
    [8,[bdf?'8388607':'32767',bdf?'8388607':'32767']],
    [80,['','']],[8,ns.map(String)],[32,['','']]
  ] as const
  for(const [w,items] of lists){
    for(let i=0;i<channels;i++)put(bytes,pos+i*w,w,items[i])
    pos+=w*channels
  }
  for(let rec=0;rec<records;rec++){
    let off=headerSize+rec*recordBytes
    const eeg=bdf?[-8388608,0,4194304,8388607]:[-32768,0,16384,32767]
    for(const v of eeg){
      const raw=v<0?(1<<(width*8))+v:v
      for(let i=0;i<width;i++)bytes[off++]=(raw>>>(8*i))&255
    }
    if(annotation){
      const words=enc.encode(rec===0?'+0.25\x14Stim 11\x14\x00':'')
      const place=new Uint8Array(ns[1]*width)
      place.set(words)
      bytes.set(place,off)
    }else{
      for(let i=0;i<ns[1];i++){
        const raw=bdf?(i===1?0x12000b:0):(i===1?11:0)
        for(let j=0;j<width;j++)bytes[off++]=(raw>>>(8*j))&255
      }
    }
  }
  return bytes.buffer
}
function vision(){
  const header=[
    'Brain Vision Data Exchange Header File Version 1.0',
    '[Common Infos]', 'DataFile=run.eeg','MarkerFile=run.vmrk',
    'DataFormat=BINARY','DataOrientation=MULTIPLEXED',
    'NumberOfChannels=2','SamplingInterval=1000',
    '[Binary Infos]', 'BinaryFormat=INT_16',
    '[Channel Infos]', 'Ch1=Fz,,0.1,µV','Ch2=ECG,,2,mV'
  ].join('\r\n')
  const markers=[
    'Brain Vision Data Exchange Marker File, Version 1.0',
    '[Common Infos]','DataFile=run.eeg','[Marker Infos]',
    'Mk1=Stimulus,S 11,3,1,0','Mk2=Stimulus,S 12,5,1,0'
  ].join('\r\n')
  const b=new ArrayBuffer(2*2*6),view=new DataView(b)
  const rows=[[100,1],[200,2],[300,3],[400,4],[500,5],[600,6]]
  rows.forEach((row,i)=>row.forEach((value,j)=>view.setInt16((i*2+j)*2,value,true)))
  return {header,markers,b}
}

describe('Genuine in-browser electrophysiology formats',()=>{
  it('decodes EDF physical calibration and original integer-coded Status triggers',()=>{
    const rec=parseEDFBDF(makeEDF(),'test.edf')
    expect(rec.info.sfreq).toBe(4)
    expect(rec.info.samples).toBe(8)
    expect(rec.info.channels[0]).toEqual({name:'Cz',type:'eeg',unit:'µV'})
    expect(rec.raw[0][0]).toBeCloseTo(-100,4)
    expect(rec.raw[0][3]).toBeCloseTo(100,4)
    expect(rec.raw[1][1]).toBe(11)
    expect(rec.info.events).toEqual([])
  })
  it('preserves BioSemi 24-bit signed signal samples and unsigned full Status word',()=>{
    const rec=parseEDFBDF(makeEDF({bdf:true}),'test.bdf')
    expect(rec.raw[0][0]).toBeCloseTo(-100,4)
    expect(rec.raw[0][3]).toBeCloseTo(100,4)
    expect(rec.raw[1][1]).toBe(0x12000b)
    expect(rec.info.source).toBe('bdf/browser')
    expect(rec.info.warnings.join(' ')).toContain('0xFFFF')
  })
  it('imports EDF+ TAL annotations with correct onset and labels',()=>{
    const rec=parseEDFBDF(makeEDF({annotations:true}),'test.edf')
    expect(rec.info.channels).toHaveLength(1)
    expect(rec.info.events[0]).toMatchObject({time:.25,label:'Stim 11',code:11,source:'edf-annotation'})
  })
  it('rejects EDF discontinuities and mixed sampling rates instead of shifting event time',()=>{
    expect(()=>parseEDFBDF(makeEDF({discontinuous:true}),'test.edf')).toThrow(/discontinu/)
    expect(()=>parseEDFBDF(makeEDF({ratesDiffer:true}),'test.edf')).toThrow(/fréquences/)
  })
  it('loads BrainVision as a three-file set, retaining calibrated units and event codes',()=>{
    const {header,markers,b}=vision()
    const rec=parseBrainVision(header,b,markers,'run.vhdr')
    expect(rec.info.sfreq).toBe(1000)
    expect(rec.raw[0]).toEqual([10,20,30,40,50,60])
    expect(rec.raw[1]).toEqual([2,4,6,8,10,12])
    expect(rec.info.channels[0].unit).toBe('µV')
    expect(rec.info.events).toMatchObject([
      {time:.002,label:'S 11',code:11},{time:.004,label:'S 12',code:12}
    ])
  })
  it('requires the data companion and marker files for BrainVision selections',async()=>{
    const {header,markers,b}=vision()
    const files=[new File([header],'run.vhdr'),
      new File([b],'run.eeg'),new File([markers],'run.vmrk')]
    expect((await importScientificFiles(files)).info.events).toHaveLength(2)
    await expect(importScientificFiles(files.slice(0,2))).rejects.toThrow(/vmrk/)
    await expect(importScientificFiles(files.slice(0,1))).rejects.toThrow(/eeg/)
  })
  it('reads full EDF/BDF data using file slices and validates the sample metadata',async()=>{
    const edf=new File([makeEDF()],'run.edf')
    const rec=await importScientificFiles([edf])
    expect(rec.info.samples).toBe(8)
    expect(rec.raw[0][0]).toBeCloseTo(-100)
    const bdf=new File([makeEDF({bdf:true})],'run.bdf')
    const other=await importScientificFiles([bdf])
    expect(other.raw[1][1]).toBe(0x12000b)
    expect(other.info.warnings.join(' ')).toContain('0xFFFF')
  })
  it('supports BrainVision vectorized data orientation without channel mixing',()=>{
    const {header,markers,b}=vision()
    const matrix=new DataView(new ArrayBuffer(b.byteLength))
    const source=new DataView(b)
    const samples=b.byteLength/4
    for(let ch=0;ch<2;ch++)for(let i=0;i<samples;i++)
      matrix.setInt16((ch*samples+i)*2,source.getInt16((i*2+ch)*2,true),true)
    const vecHeader=header.replace('DataOrientation=MULTIPLEXED','DataOrientation=VECTORIZED')
    const loaded=parseBrainVision(vecHeader,matrix.buffer,markers,'run.vhdr')
    expect(loaded.raw[0]).toEqual([10,20,30,40,50,60])
    expect(loaded.raw[1]).toEqual([2,4,6,8,10,12])
  })
  it('never claims FIF or ACQ decoding support in browser mode',async()=>{
    await expect(importScientificFiles([new File(['test'],'raw.fif')])).rejects.toThrow(/Python/)
  })
})
