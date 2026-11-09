import { describe,expect,it } from 'vitest'
import { inventoryCSV,inventoryJSON,scanDatasetInventory } from './batchInventory'

const enc=new TextEncoder()
function put(arr:Uint8Array,pos:number,width:number,text:string){
  arr.fill(32,pos,pos+width)
  arr.set(enc.encode(text),pos)
}
function edf(name='subject.edf',opts:{bdf?:boolean;discontinuous?:boolean;mixed?:boolean}={}):File{
  const n=2,header=256+256*n,samples=opts.mixed?[4,8]:[4,4]
  const bdf=opts.bdf??false
  const body=2*samples.reduce((a,b)=>a+b,0)*(bdf?3:2)
  const bytes=new Uint8Array(header+body)
  put(bytes,0,8,bdf?'BIOSEMI':'0')
  put(bytes,184,8,String(header))
  put(bytes,192,44,opts.discontinuous?'EDF+D':'EDF+C')
  put(bytes,236,8,'2');put(bytes,244,8,'1');put(bytes,252,4,String(n))
  const labels=['Cz','Status']
  labels.forEach((x,i)=>put(bytes,256+i*16,16,x))
  const start=256+216*n
  samples.forEach((count,i)=>put(bytes,start+i*8,8,String(count)))
  return new File([bytes],name)
}
function bv(){
  const vhdr=[
    'Brain Vision Data Exchange Header File Version 1.0',
    '[Common Infos]','DataFile=record.eeg','MarkerFile=record.vmrk',
    'DataFormat=BINARY','DataOrientation=MULTIPLEXED',
    'NumberOfChannels=2','SamplingInterval=1000',
    '[Binary Infos]','BinaryFormat=INT_16'
  ].join('\n')
  return [new File([vhdr],'record.vhdr'),
    new File([new Uint8Array(4*100)],'record.eeg'),
    new File(['[Marker Infos]\nMk1=Stimulus,S 11,1,1,0'],'record.vmrk')]
}
describe('Header-only offline batch inventory',()=>{
  it('reads EDF/BDF metadata without loading any raw signal samples',async()=>{
    const rows=await scanDatasetInventory([edf(),edf('bio.bdf',{bdf:true})])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      status:'readable',channels:2,sampling_hz:4,duration_s:2,
      samples_per_channel:8,has_event_channel:true
    })
    expect(rows[1].status).toBe('readable')
    expect(rows[1].format).toBe('BDF')
    expect(rows[0]).not.toHaveProperty('raw')
  })
  it('identifies genuinely incompatible EDF timing',async()=>{
    const files=[edf('discontinuous.edf',{discontinuous:true}),edf('mixed.edf',{mixed:true})]
    const rows=await scanDatasetInventory(files)
    expect(rows[0].status).toBe('partial')
    expect(rows[0].duration_s).toBeNull()
    expect(rows[0].warnings.join()).toMatch(/Discontinuous/)
    expect(rows[1].sampling_hz).toBeNull()
    expect(rows[1].warnings.join()).toMatch(/Multiple channel rates/)
  })
  it('requires all BrainVision companion files to mark an acquisition fully readable',async()=>{
    const all=bv()
    const rows=await scanDatasetInventory(all)
    expect(rows[0]).toMatchObject({status:'readable',channels:2,sampling_hz:1000,
      duration_s:.1,has_event_channel:true})
    expect(rows[0].companion_files).toEqual(['record.eeg','record.vmrk'])
    const missing=await scanDatasetInventory(all.slice(0,1))
    expect(missing[0].status).toBe('partial')
  })
  it('does not fabricate CSV sampling rates or FIF capabilities',async()=>{
    const rows=await scanDatasetInventory([
      new File(['time_s,Fz,Cz\n0,1,2'],'study.csv'),
      new File(['binary'],'subject.fif')
    ])
    expect(rows[0].channels).toBe(2)
    expect(rows[0].sampling_hz).toBeNull()
    expect(rows[0].duration_s).toBeNull()
    expect(rows[1].status).toBe('python')
  })
  it('correctly counts quoted CSV column names containing separator characters',async()=>{
    const data=['time_s,"EEG, Fz",ECG','0,1,2'].join(String.fromCharCode(10))
    const rows=await scanDatasetInventory([new File([data],'quoted.csv')])
    expect(rows[0].channels).toBe(2)
    expect(rows[0].status).toBe('partial')
  })
  it('redacts filenames by default and avoids spreadsheet formula injection',async()=>{
    const rows=await scanDatasetInventory([new File(['time_s,EEG\n0,1'],'=HYPERLINK.csv')])
    const redacted=inventoryCSV(rows)
    expect(redacted).not.toContain('HYPERLINK')
    expect(inventoryJSON(rows)).not.toContain('HYPERLINK')
    expect(inventoryCSV(rows,false)).toContain("'=HYPERLINK.csv")
    expect(inventoryJSON(rows,false)).toContain('=HYPERLINK.csv')
  })
  it('bounds number of datasets for responsive local screening',async()=>{
    await expect(scanDatasetInventory([])).rejects.toThrow()
    await expect(scanDatasetInventory(Array.from({length:151},()=>new File(['a'],'a.fif'))))
      .rejects.toThrow(/150/)
  })
})
