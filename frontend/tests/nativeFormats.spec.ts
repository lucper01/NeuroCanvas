import { test, expect } from '@playwright/test'

function field(buf:Buffer,offset:number,width:number,value:string){
  buf.fill(32,offset,offset+width)
  Buffer.from(value,'latin1').copy(buf,offset,0,width)
}
function makeBDF(){
  const nchan=2,ns=32,header=256+256*nchan,nbytes=3
  const b=Buffer.alloc(header+ns*nchan*nbytes)
  field(b,0,8,'BIOSEMI')
  field(b,8,80,'Synthetic subject')
  field(b,88,80,'Browser import test')
  field(b,168,8,'01.01.25')
  field(b,176,8,'12.00.00')
  field(b,184,8,String(header))
  field(b,236,8,'1')
  field(b,244,8,'1')
  field(b,252,4,String(nchan))
  let pos=256
  const properties:[number,string[]][]=[
    [16,['Cz','Status']], [80,['','']], [8,['uV','code']],
    [8,['-100','-100']], [8,['100','100']],
    [8,['-8388608','-8388608']], [8,['8388607','8388607']],
    [80,['','']], [8,['32','32']], [32,['','']]
  ]
  for(const [width,values] of properties){
    values.forEach((value,i)=>field(b,pos+i*width,width,value))
    pos+=width*nchan
  }
  const digital=(pos:number,v:number)=>{
    const u=v<0?v+16777216:v
    b[pos]=u&255;b[pos+1]=(u>>8)&255;b[pos+2]=(u>>16)&255
  }
  for(let i=0;i<ns;i++){
    digital(header+i*3,Math.round(0.4*8388607*Math.sin(i*2*Math.PI/8)))
    digital(header+ns*3+i*3,i>=8&&i<10?0x12000b:0)
  }
  return b
}
function vision(){
  const vhdr=[
    'Brain Vision Data Exchange Header File Version 1.0',
    '[Common Infos]','DataFile=run.eeg','MarkerFile=run.vmrk',
    'DataFormat=BINARY','DataOrientation=MULTIPLEXED',
    'NumberOfChannels=2','SamplingInterval=1000',
    '[Binary Infos]','BinaryFormat=INT_16',
    '[Channel Infos]','Ch1=Fz,,0.1,µV','Ch2=ECG,,2,mV'
  ].join('\r\n')
  const vmrk=[
    'Brain Vision Data Exchange Marker File, Version 1.0',
    '[Common Infos]','DataFile=run.eeg',
    '[Marker Infos]','Mk1=Stimulus,S 11,20,1,0'
  ].join('\r\n')
  const eeg=Buffer.alloc(80*2*2)
  for(let i=0;i<80;i++){
    eeg.writeInt16LE(100+i,i*4)
    eeg.writeInt16LE(i+1,i*4+2)
  }
  return [
    {name:'run.vhdr',mimeType:'text/plain',buffer:Buffer.from(vhdr)},
    {name:'run.eeg',mimeType:'application/octet-stream',buffer:eeg},
    {name:'run.vmrk',mimeType:'text/plain',buffer:Buffer.from(vmrk)}
  ]
}

test.describe('Native electrophysiology import without Python',()=>{
  test.use({locale:'fr-FR'})
  test('loads a BioSemi BDF and decodes masked Status trigger pulses',async({page,isMobile})=>{
    await page.goto('/')
    await page.locator('input[type=file][multiple]').setInputFiles({
      name:'fixture.bdf',mimeType:'application/octet-stream',buffer:makeBDF()
    })
    await expect(page.getByText(/Fichier scientifique chargé localement/)).toBeVisible()
    if(isMobile)await page.getByRole('button',{name:'Menu'}).click()
    await page.getByRole('button',{name:'Trigger & Epoch Studio',exact:true}).click()
    const mask=page.getByRole('combobox',{name:'Masque de bits'})
    await expect(mask).toHaveValue('65535')
    await page.getByRole('button',{name:'Prévisualiser'}).click()
    await expect(page.getByText('11 : 1')).toBeVisible()
  })
  test('loads a complete BrainVision three-file recording and imports event markers',async({page,isMobile})=>{
    await page.goto('/')
    await page.locator('input[type=file][multiple]').setInputFiles(vision())
    await expect(page.getByText(/Fichier scientifique chargé localement/)).toBeVisible()
    if(isMobile)await page.getByRole('button',{name:'Menu'}).click()
    await page.getByRole('button',{name:'Trigger & Epoch Studio',exact:true}).click()
    await expect(page.getByText('S 11',{exact:true}).first()).toBeVisible()
    await expect(page.getByText('brainvision-marker',{exact:true}).first()).toBeVisible()
  })
})
