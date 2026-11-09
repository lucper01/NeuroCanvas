import type { LocalRecording, QCReport, QCWindow } from './types'
import { qualityWindows } from './qc'

/**
 * All-channel window screening without modifying samples. Thresholds are
 * unit-independent comparisons within each channel, not artifact diagnosis.
 */
export type QualitySummary = {
  channel: string; modality: string; unit: string; windows: number
  high: number; flat: number; manual: number; flagged: number
  median_ptp: number; marked_bad: boolean
}
export type QualityCell = 0 | 1 | 2 | 3

function cellValue(window: QCWindow): QualityCell {
  if (window.manually_excluded) return 3
  if (window.relative_high_amplitude) return 2
  if (window.relative_flat) return 1
  return 0
}
export function summarizeQuality(report: QCReport): QualitySummary[] {
  return report.channel_results.map(ch=>{
    const high=ch.windows.filter(w=>w.relative_high_amplitude).length
    const flat=ch.windows.filter(w=>w.relative_flat).length
    const manual=ch.windows.filter(w=>w.manually_excluded).length
    const flagged=ch.windows.filter(w=>
      w.relative_high_amplitude||w.relative_flat||w.manually_excluded).length
    return {channel:ch.name,modality:ch.type,unit:ch.unit,windows:ch.windows.length,
      high,flat,manual,flagged,median_ptp:ch.median_ptp,marked_bad:ch.marked_bad}
  })
}
export function matrixFromQuality(report: QCReport, maxBins=120){
  if(!Number.isInteger(maxBins)||maxBins<1||maxBins>2000)throw Error('Invalid matrix resolution.')
  const channels=report.channel_results
  const longest=Math.max(0,...channels.map(ch=>ch.windows.length))
  const bins=Math.min(longest,maxBins)
  if(!bins)return {x:[],y:[],z:[],binLength:0}
  const binLength=Math.max(1,Math.ceil(longest/bins))
  const actualBins=Math.ceil(longest/binLength)
  const x=Array.from({length:actualBins},(_,i)=>
    (i*binLength+Math.min(longest,(i+1)*binLength))/2*report.window_seconds)
  const y=channels.map(ch=>ch.name)
  const z=channels.map(ch=>Array.from({length:actualBins},(_,bin)=>{
    const block=ch.windows.slice(bin*binLength,(bin+1)*binLength)
    if(!block.length)return null
    return Math.max(...block.map(cellValue)) as QualityCell
  }))
  return {x,y,z,binLength}
}
function escapeCSV(text:string):string{
  // Prefix spreadsheet formula injection only for user-controlled text.
  const safe=/^[=+\-@\t\r]/.test(text)?"'"+text:text
  return /[",\r\n]/.test(safe)?'"'+safe.replace(/"/g,'""')+'"':safe
}
export function qualityCSV(report:QCReport):string{
  const rows=['channel,type,unit,start_s,end_s,rms,std,ptp,max_step,high_amplitude,flat,manually_excluded,channel_marked_bad']
  for(const ch of report.channel_results)for(const w of ch.windows){
    const values=[ch.name,ch.type,ch.unit,w.start,w.end,w.rms,w.std,w.ptp,w.max_step,
      w.relative_high_amplitude,w.relative_flat,w.manually_excluded,ch.marked_bad]
    rows.push(values.map(v=>typeof v==='string'?escapeCSV(v):String(v)).join(','))
  }
  return rows.join('\r\n')
}
export function auditQuality(record:LocalRecording,windowSeconds=2):QCReport{
  return qualityWindows(record,windowSeconds)
}
