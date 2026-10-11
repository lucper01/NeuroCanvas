import { describe, expect, it } from 'vitest'
import { applySteps, demo, erp, fourier, importCSV, spectrum, viewport } from './engine'

describe('NeuroCanvas browser signal engine', () => {
  it('generates deterministic multi-modal demonstration data', () => {
    const a = demo(250, 40, 10, 1)
    const b = demo(250, 40, 10, 1)
    expect(a.info.samples).toBe(10000)
    expect(a.info.channels).toHaveLength(7)
    expect(a.info.events).toHaveLength(7)
    expect(a.raw[0].slice(0, 20)).toEqual(b.raw[0].slice(0, 20))
  })
  it('detects a known 10 Hz spectral peak', () => {
    const data = demo(250, 40, 10, 0)
    const p = spectrum(data, 'EEG Fz', 0, 30)
    const max = p.psd.indexOf(Math.max(...p.psd))
    expect(p.frequency[max]).toBeCloseTo(10, 0)
    const f = fourier(data, 'EEG Fz', 0, 20)
    const maxF = f.amplitude.indexOf(Math.max(...f.amplitude))
    expect(f.frequency[maxF]).toBeCloseTo(10, 0)
  })
  it('does not alter raw data after filter and can reset the pipeline', () => {
    const data = demo()
    const before = data.raw[0][10]
    const result = applySteps(data, [{ method: 'filter', low: 1, high: 30, channels: ['EEG Fz'] }])
    expect(result.processed[0][10]).not.toBe(before)
    expect(result.raw[0][10]).toBe(before)
    const restored = applySteps(result, [])
    expect(restored.processed[0][10]).toBe(before)
  })
  it('rejects frequencies beyond Nyquist', () => {
    expect(() => applySteps(demo(), [{ method: 'filter', high: 150 }])).toThrow()
  })
  it('preserves local extrema when decimating the viewport', () => {
    const data = demo()
    const traces = viewport(data, ['ECG'], 0, 30)
    expect(traces[0].x.length).toBeLessThan(1500)
    expect(Math.max(...traces[0].y)).toBeGreaterThan(0.5)
  })
  it('infers Fs from regular time_s and rejects irregular timestamps', () => {
    const input = 'time_s,Cz\n0,1\n0.004,2\n0.008,3\n0.012,4\n'
    const parsed = importCSV(input, 'my.csv')
    expect(parsed.info.sfreq).toBeCloseTo(250)
    expect(() => importCSV('time_s,Cz\n0,1\n0.004,2\n0.009,3\n0.012,4', 'broken.csv', 250)).toThrow()
  })
  it('computes event-related averages from synthetic events', () => {
    const data = demo()
    const result = erp(data, 'EEG Fz', 'stimulus', -.2, .8)
    expect(result.n).toBe(7)
    expect(result.mean.length).toBe(result.time.length)
  })
})
