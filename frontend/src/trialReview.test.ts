import { describe, expect, it } from 'vitest'
import { demo } from './engine'
import { commitTriggers, conditionEpochs, detectTriggers, setLocalTrialDecision } from './triggers'
import { summarizeConditions, metricsCSV } from './conditionMetrics'

function recorded() {
  const source = demo()
  return commitTriggers(source, detectTriggers(source, 'TRIGGER TTL'))
}

describe('NeuroCanvas per-trial review', () => {
  it('rejects a selected epoch without editing the raw data', () => {
    const rec = recorded()
    const initial = conditionEpochs(rec, 'EEG Fz', 'Visual')
    expect(initial.n).toBe(4)
    const uid = initial.trials[0].event_uid!
    const preserved = rec.raw[0][1240]
    const reviewed = setLocalTrialDecision(rec, uid, true, 'blink')
    expect(reviewed.info.trial_decisions).toHaveLength(1)
    expect(rec.info.trial_decisions).toBeUndefined()
    expect(reviewed.raw[0][1240]).toBe(preserved)
    const annotated = conditionEpochs(reviewed, 'EEG Fz', 'Visual')
    expect(annotated.n).toBe(4)
    expect(annotated.trials[0].review_rejected).toBe(true)
    expect(annotated.trials[0].review_reason).toBe('blink')
    const curated = conditionEpochs(reviewed, 'EEG Fz', 'Visual', -.2, .8, 0, false, true)
    expect(curated.n).toBe(3)
    expect(curated.excluded_rejected).toBe(1)
    const restored = setLocalTrialDecision(reviewed, uid, false, '')
    expect(restored.info.trial_decisions).toHaveLength(0)
    expect(conditionEpochs(restored, 'EEG Fz', 'Visual', -.2, .8, 0, false, true).n).toBe(4)
  })

  it('requires an explicit meaningful rejection reason', () => {
    const rec = recorded()
    const uid = conditionEpochs(rec, 'EEG Fz', 'Visual').trials[0].event_uid!
    expect(() => setLocalTrialDecision(rec, uid, true, '')).toThrow()
    expect(() => setLocalTrialDecision(rec, 'missing', true, 'movement')).toThrow()
  })

  it('reports all available conditions without inferential tests', () => {
    const rec = recorded()
    const stats = summarizeConditions(rec,'EEG Fz',-.2,.8,0,.3,0,false,false)
    expect(stats.conditions.map(c=>c.condition)).toEqual(['Auditory','Visual'])
    const visual = stats.conditions.find(c=>c.condition==='Visual')!
    expect(visual.n).toBe(4)
    expect(Number.isFinite(visual.mean_amplitude)).toBe(true)
    expect(visual.peak_latency_s).toBeGreaterThanOrEqual(0)
    expect(visual.peak_latency_s).toBeLessThanOrEqual(.3)
    expect(metricsCSV(stats)).toContain('signed_auc')
    expect(metricsCSV(stats)).toContain('"Visual"')
  })

  it('tracks rejected-trial counts in descriptive condition summary', () => {
    const rec = recorded()
    const uid = conditionEpochs(rec,'EEG Fz','Visual').trials[0].event_uid!
    const reviewed = setLocalTrialDecision(rec,uid,true,'motion artifact')
    const result=summarizeConditions(reviewed,'EEG Fz',-.2,.8,0,.3,0,false,true)
    const visual=result.conditions.find(c=>c.condition==='Visual')!
    expect(visual.n).toBe(3)
    expect(visual.excluded_rejected).toBe(1)
  })

  it('rejects measurement intervals outside selected epochs', () => {
    expect(() => summarizeConditions(recorded(),'EEG Fz',-.2,.8,.5,1,0,false,false)).toThrow()
  })
})


describe('Paginated epoch review',()=>{
  it('keeps condition grand averages invariant across trial pages',()=>{
    const rec=recorded()
    const p1=conditionEpochs(rec,'EEG Fz','Visual',-.2,.8,0,false,false,0,2)
    const p2=conditionEpochs(rec,'EEG Fz','Visual',-.2,.8,0,false,false,2,2)
    expect(p1.trials).toHaveLength(2)
    expect(p2.trials).toHaveLength(2)
    expect(p1.next_offset).toBe(2)
    expect(p2.next_offset).toBeNull()
    expect(p2.trials[0].event_index).toBe(2)
    expect(p1.mean).toEqual(p2.mean)
  })
})
