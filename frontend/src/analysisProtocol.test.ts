import { describe, expect, it } from 'vitest'
import { createAnalysisProtocol, parseAnalysisProtocol } from './analysisProtocol'

const base = {
  name:'Standard EEG event recipe',
  detection:{ channel:'Status',min_width_ms:4,min_interval_ms:25,
    tolerance:.25,bit_mask:255 },
  codebook:[
    {code:11,meaning:'Visual standard',conditions:['Visual','Standard']},
    {code:12,meaning:'Visual deviant',conditions:['Visual']}
  ],
  epoch:{channel:'Cz',tmin:-.2,tmax:.8,baseline_end:0,
    measurement_start:.1,measurement_end:.4,exclude_marked:true,exclude_rejected:false}
}

describe('Portable analysis protocols',()=>{
  it('creates a validated, portable protocol with no physiological data',()=>{
    const saved=createAnalysisProtocol(base)
    expect(saved.schema).toBe('neurocanvas.analysis-protocol.v1')
    expect(saved.detection.bit_mask).toBe(255)
    expect(saved.codebook[0].conditions).toContain('Standard')
    expect(JSON.stringify(saved)).not.toContain('raw')
    expect(parseAnalysisProtocol(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  })
  it('rejects invalid or duplicated codebooks',()=>{
    expect(()=>createAnalysisProtocol({...base,codebook:[...base.codebook,base.codebook[0]]})).toThrow()
  })
  it('rejects impossible measurement windows, masks and invalid imports',()=>{
    expect(()=>createAnalysisProtocol({...base,epoch:{...base.epoch,measurement_end:1.2}})).toThrow()
    expect(()=>createAnalysisProtocol({...base,detection:{...base.detection,bit_mask:-1}})).toThrow()
    expect(()=>parseAnalysisProtocol({})).toThrow()
  })
})
