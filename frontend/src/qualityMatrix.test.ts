import { describe,expect,it } from 'vitest'
import { demo } from './engine'
import { auditQuality,matrixFromQuality,qualityCSV,summarizeQuality } from './qualityMatrix'

describe('All-channel QC audit and heatmap',()=>{
  it('preserves raw samples while producing a channel-by-time matrix',()=>{
    const rec=demo()
    const copy=rec.raw[0].slice()
    const report=auditQuality(rec,2)
    expect(report.channel_results).toHaveLength(rec.info.channels.length)
    const matrix=matrixFromQuality(report,10)
    expect(matrix.y).toHaveLength(rec.info.channels.length)
    expect(matrix.z.every(row=>row.length===matrix.x.length)).toBe(true)
    expect(rec.raw[0]).toEqual(copy)
  })
  it('flags strong relative amplitude without auto-excluding the channel',()=>{
    const rec=demo()
    const n=rec.info.sfreq
    for(let j=6*n;j<8*n;j++)rec.processed[0][j]*=3000
    const report=auditQuality(rec,2)
    expect(summarizeQuality(report)[0].high).toBeGreaterThan(0)
    expect(rec.info.bad_segments).toBeUndefined()
    expect(matrixFromQuality(report).z[0]).toContain(2)
  })
  it('gives manually marked segments priority in display',()=>{
    const rec=demo()
    rec.info.bad_segments=[{start:1,end:3,reason:'Review'}]
    const report=auditQuality(rec,2)
    expect(matrixFromQuality(report).z[0][0]).toBe(3)
    expect(summarizeQuality(report)[0].manual).toBeGreaterThan(0)
  })
  it('exports full data even when the on-screen matrix is binned',()=>{
    const report=auditQuality(demo(),2)
    const csv=qualityCSV(report)
    const expected=1+report.channel_results.reduce((sum,x)=>sum+x.windows.length,0)
    expect(csv.split('\r\n')).toHaveLength(expected)
    expect(csv).toContain('channel_marked_bad')
  })
  it('rejects invalid bin counts',()=>{
    expect(()=>matrixFromQuality(auditQuality(demo()),0)).toThrow()
    expect(()=>matrixFromQuality(auditQuality(demo()),2001)).toThrow()
  })
})
