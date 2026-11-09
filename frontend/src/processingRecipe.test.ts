import { describe,expect,it } from 'vitest'
import { demo } from './engine'
import { createProcessingRecipe,inspectProcessingRecipe } from './processingRecipe'

const rec=()=>demo()
describe('Reusable preprocessing recipes',()=>{
  it('exports validated channel-specific steps without physiological samples',()=>{
    const r=rec()
    r.info.history=[
      {method:'filter',channels:['EEG Fz'],low:.5,high:40},
      {method:'notch',channels:['EEG Cz'],frequency:50,quality:30},
      {method:'average_reference',channels:['EEG Fz','EEG Cz']}
    ]
    const recipe=createProcessingRecipe(r.info,'Research protocol')
    const json=JSON.stringify(recipe)
    expect(json).not.toContain('"raw":')
    expect(json).not.toContain('"processed":')
    expect(inspectProcessingRecipe(JSON.parse(json),r.info).steps).toEqual(r.info.history)
  })
  it('rejects absent channel names and TTL modification',()=>{
    const r=rec(),recipe=createProcessingRecipe(r.info)
    recipe.steps=[{method:'filter',channels:['P99'],low:1,high:40}]
    expect(()=>inspectProcessingRecipe(recipe,r.info)).toThrow(/absent/)
    recipe.steps=[{method:'filter',channels:['TRIGGER TTL'],low:1,high:40}]
    expect(()=>inspectProcessingRecipe(recipe,r.info)).toThrow(/TTL/)
  })
  it('rejects incorrect filters, Nyquist violations and unknown methods',()=>{
    const r=rec(),recipe=createProcessingRecipe(r.info)
    recipe.steps=[{method:'filter',channels:['EEG Fz'],low:1,high:125}]
    expect(()=>inspectProcessingRecipe(recipe,r.info)).toThrow(/filter/)
    recipe.steps=[{method:'filter',channels:['EEG Fz'],low:null,high:null}]
    expect(()=>inspectProcessingRecipe(recipe,r.info)).toThrow(/filter/)
    recipe.steps=[{method:'arbitrary',channels:['EEG Fz']}]
    expect(()=>inspectProcessingRecipe(recipe,r.info)).toThrow(/Unknown/)
  })
  it('warns about sampling and unit mismatches, without transforming data',()=>{
    const r=rec(),recipe=createProcessingRecipe(r.info)
    recipe.steps=[{method:'demean',channels:['EEG Fz']}]
    recipe.sampling_rate_hz=512
    recipe.channels.find(x=>x.name==='EEG Fz')!.unit='V'
    expect(inspectProcessingRecipe(recipe,r.info).warnings).toHaveLength(2)
  })
  it('requires at least two EEG channels for average referencing',()=>{
    const r=rec(),recipe=createProcessingRecipe(r.info)
    recipe.steps=[{method:'average_reference',channels:['EEG Fz']}]
    expect(()=>inspectProcessingRecipe(recipe,r.info)).toThrow(/at least two/)
  })
})
