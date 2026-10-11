import { describe, expect, it } from 'vitest'
import { demo } from './engine'
import { detectTriggers, commitTriggers, conditionEpochs, eventCSV, epochCSV,
  validateDefinitions, mapTrigger } from './triggers'

describe('Trigger & Epoch Studio (offline scientific engine)', () => {
  it('finds exact onset and codes in the synthetic TTL channel', () => {
    const data=demo()
    const result=detectTriggers(data,'TRIGGER TTL')
    expect(result.events).toHaveLength(7)
    expect(result.counts).toEqual({'11':2,'12':2,'21':2,'22':1})
    expect(result.events[0].time).toBe(5)
    expect(data.info.events).toHaveLength(7) // Preview is not committed.
  })
  it('commits detected codes separately from existing event annotations', () => {
    const data=demo()
    const preview=detectTriggers(data,'TRIGGER TTL')
    const updated=commitTriggers(data,preview)
    expect(data.info.events).toHaveLength(7)
    expect(updated.info.events).toHaveLength(14)
    expect(updated.info.events.some(e=>e.code===11)).toBe(true)
  })
  it('allows multiple trigger codes in one condition and one code in multiple conditions', () => {
    const data=demo(), found=detectTriggers(data,'TRIGGER TTL')
    const initial=commitTriggers(data,found)
    const definition=validateDefinitions([
      {code:11,meaning:'Visual standard',conditions:['Visual','Standard']},
      {code:12,meaning:'Visual oddball',conditions:['Visual']},
      {code:21,meaning:'Auditory standard',conditions:['Auditory','Standard']},
      {code:22,meaning:'Auditory oddball',conditions:['Auditory']}
    ])
    const rec={...initial,info:{...initial.info,trigger_definitions:definition}}
    const visual=conditionEpochs(rec,'EEG Fz','Visual',-.2,.8)
    const auditory=conditionEpochs(rec,'EEG Fz','Auditory',-.2,.8)
    const standard=conditionEpochs(rec,'EEG Fz','Standard',-.2,.8)
    expect(visual.n).toBe(4)
    expect(auditory.n).toBe(3)
    expect(standard.n).toBe(4)
    expect(visual.codes).toEqual({'11':2,'12':2})
    expect(epochCSV(visual)).toContain('Visual')
    expect(eventCSV(rec)).toContain('Visual oddball')
    expect(mapTrigger(rec.info.events.find(e=>e.code===11)!,definition).conditions).toContain('Standard')
  })
  it('can reject manually flagged periods without affecting the raw recording', () => {
    const data=demo()
    const rec=commitTriggers(data,detectTriggers(data,'TRIGGER TTL'))
    const orig=conditionEpochs(rec,'EEG Cz','Visual',-.2,.8)
    const selected={...rec,info:{...rec.info,bad_segments:[{start:4.95,end:5.2,reason:'movement'}]}}
    const curated=conditionEpochs(selected,'EEG Cz','Visual',-.2,.8,0,true)
    expect(curated.n).toBe(orig.n-1)
    expect(curated.excluded_manual).toBe(1)
    expect(data.raw[0][10]).toBe(rec.raw[0][10])
  })
  it('decodes trigger bytes from a composite status channel', () => {
    const rec=demo()
    rec.raw[6][1250]=65536+11
    rec.raw[6][1251]=65536+11
    rec.raw[6][1252]=65536+11
    const detected=detectTriggers(rec,'TRIGGER TTL',0,0,.25,65535)
    expect(detected.counts['11']).toBe(2)
    expect(detected.events[0].code).toBe(11)
  })
  it('rejects invalid codes, duplicate definitions and unknown channels', () => {
    expect(()=>validateDefinitions([{code:11,meaning:'first',conditions:[]},
      {code:11,meaning:'duplicate',conditions:[]}])).toThrow()
    expect(()=>detectTriggers(demo(),'Unknown')).toThrow()
  })
})
