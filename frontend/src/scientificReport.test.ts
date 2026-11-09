import { describe,expect,it } from 'vitest'
import { demo } from './engine'
import { auditQuality } from './qualityMatrix'
import { auditHTML,auditJSON,buildAuditData } from './scientificReport'

describe('Scientific report exports',()=>{
  it('exports FR/EN HTML and JSON without raw physiological values',()=>{
    const r=demo()
    r.info.name='participant_0001.bdf'
    const d=buildAuditData(r.info,auditQuality(r),'JavaScript',true)
    const html=auditHTML(d,'en'),json=auditJSON(d)
    expect(html).toContain('Analysis report')
    expect(html).not.toContain('participant_0001.bdf')
    expect(json).not.toContain('participant_0001.bdf')
    expect(json).not.toContain('"processed"')
    expect(json).not.toContain('"raw"')
    expect(JSON.parse(json).schema).toBe('neurocanvas.audit-report.v1')
  })
  it('escapes user-controlled filenames, events and bad-segment reasons in HTML',()=>{
    const r=demo()
    r.info.name='<script>bad()</script>'
    r.info.events=[{time:1,label:'<img src=x onerror=bad()>',duration:0}]
    r.info.bad_segments=[{start:2,end:3,reason:'<svg onload=bad()>'}]
    const html=auditHTML(buildAuditData(r.info,null,'browser',false),'fr')
    expect(html).not.toContain('<script>bad()')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<svg onload')
    expect(html).toContain('&lt;img')
  })
  it('warns when samples were preview-truncated and QC was not run',()=>{
    const r=demo()
    r.info.warnings.push('Aperçu tronqué à 60 s')
    const html=auditHTML(buildAuditData(r.info,null,'browser'),'fr')
    expect(html).toContain('QC non calculé')
    expect(html).toContain('YES')
    expect(html).toContain('Aperçu tronqué')
  })
  it('documents trigger codebook grouping and per-trial decisions in HTML',()=>{
    const rec=demo()
    rec.info.trial_decisions=[{
      event_uid:'sample:250:11',rejected:true,reason:'Manual blink artifact'
    }]
    const html=auditHTML(buildAuditData(rec.info,auditQuality(rec),'browser'),'en')
    expect(html).toContain('Trigger codebook &amp; conditions')
    expect(html).toContain('Visual standard')
    expect(html).toContain('Visual')
    expect(html).toContain('Manual blink artifact')
    expect(html).toContain('sample:250:11')
  })
  it('includes reversible manual decisions without automatic classification',()=>{
    const r=demo()
    r.info.bad_channels=['EEG Cz']
    r.info.bad_segments=[{start:3,end:4,reason:'Manual artifact'}]
    const html=auditHTML(buildAuditData(r.info,auditQuality(r),'browser'),'en')
    expect(html).toContain('Manual artifact')
    expect(html).toContain('EEG Cz')
    expect(html).toContain('No trial is automatically excluded')
  })
})
