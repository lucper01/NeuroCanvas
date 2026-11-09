import { useContext, useEffect, useMemo, useRef } from 'react'
import { Activity, Download, Search, ShieldCheck } from 'lucide-react'
import Plotly from 'plotly.js-dist-min'
import type { QCReport } from './types'
import { matrixFromQuality, summarizeQuality } from './qualityMatrix'
import type { Language } from './localization'
import { VisualThemeContext } from './VisualThemeContext'

type Props={
  report:QCReport|null
  locale:Language
  busy:boolean
  seconds:number
  onSeconds:(value:number)=>void
  onAnalyze:()=>void
  onExport:()=>void
  onInspect:(channel:string,start:number,end:number)=>void
}
function MatrixPlot({report,locale}:{report:QCReport;locale:Language}){
  const theme=useContext(VisualThemeContext)
  const target=useRef<HTMLDivElement>(null)
  const matrix=useMemo(()=>matrixFromQuality(report,140),[report])
  useEffect(()=>{
    const node=target.current
    if(!node||!matrix.x.length)return
    const dark=theme==='dark'
    const colorscale=[
      [0,'#27493f'],[.1666,'#27493f'],
      [.1667,'#a78d5d'],[.4999,'#a78d5d'],
      [.5,'#df9463'],[.8332,'#df9463'],
      [.8333,'#bd6486'],[1,'#bd6486']
    ]
    void Plotly.react(node,[{
      type:'heatmap',x:matrix.x,y:matrix.y,z:matrix.z,colorscale,
      zmin:0,zmax:3,xgap:1,ygap:2,
      hovertemplate:'%{y}<br>t ≈ %{x:.2f} s<br>%{z}<extra></extra>',
      colorbar:{thickness:15,tickmode:'array',tickvals:[0,1,2,3],
        ticktext:locale==='fr'?
          ['RAS','Plat','Amplitude','Manuel']:
          ['No flag','Flat','Amplitude','Manual']}
    }],{
      autosize:true,height:Math.min(1050,Math.max(310,report.channel_results.length*24+155)),
      margin:{t:20,b:58,l:Math.min(180,Math.max(75,...matrix.y.map(x=>x.length*7))),r:115},
      paper_bgcolor:dark?'#151c2a':'#fff',
      plot_bgcolor:dark?'#151c2a':'#fff',
      font:{size:11,color:dark?'#b9c8e1':'#4b625e'},
      xaxis:{title:{text:locale==='fr'?'Temps (s)':'Time (s)'},gridcolor:dark?'#334055':'#e4eae5'},
      yaxis:{autorange:'reversed',type:'category'},
    },{responsive:true,displaylogo:false})
    return ()=>{Plotly.purge(node)}
  },[matrix,report,locale,theme])
  return <div ref={target} role="img"
    aria-label={locale==='fr'?'Matrice temporelle de contrôle qualité par canal':
      'Channel-by-time quality control matrix'} className="qc-matrix-plot"/>
}
export default function QualityMatrixPanel({
  report,locale,busy,seconds,onSeconds,onAnalyze,onExport,onInspect
}:Props){
  const fr=locale==='fr'
  const rows=useMemo(()=>report?summarizeQuality(report):[],[report])
  return <section className="panel qc-matrix-panel">
    <div className="panel-heading">
      <div><h3><ShieldCheck size={18} style={{verticalAlign:'middle',marginRight:8}}/>
        {fr?'Matrice de qualité multicanal':'Multichannel quality matrix'}</h3>
        <p>{fr?'Analyse descriptive de l’ensemble des canaux, sans exclusion automatique':
          'Descriptive screening across all channels, with no automatic rejection'}</p></div>
      <span className="neuro-panel-hint">ALL CHANNELS</span>
    </div>
    <div className="toolbar qc-matrix-actions">
      <label>{fr?'Fenêtre (secondes)':'Window (seconds)'}
        <input type="number" min=".2" max="60" step=".5" value={seconds}
          onChange={e=>onSeconds(Number(e.target.value))}/></label>
      <button className="primary" disabled={busy} onClick={onAnalyze}>
        <Activity size={15}/>{fr?'Analyser tous les canaux':'Scan all channels'}</button>
      <button className="outline" disabled={!report} onClick={onExport}>
        <Download size={15}/>{fr?'Exporter toutes les fenêtres CSV':'Export all windows CSV'}</button>
    </div>
    {report ? <>
      <div className="qc-matrix-kpis">
        <div><strong>{rows.length}</strong><small>{fr?'Canaux':'Channels'}</small></div>
        <div><strong>{rows.reduce((a,x)=>a+x.windows,0)}</strong>
          <small>{fr?'Fenêtres totales':'Total windows'}</small></div>
        <div><strong>{rows.reduce((a,x)=>a+x.flagged,0)}</strong>
          <small>{fr?'Fenêtres signalées':'Flagged windows'}</small></div>
        <div><strong>{rows.filter(x=>x.marked_bad).length}</strong>
          <small>{fr?'Canaux marqués':'Marked channels'}</small></div>
      </div>
      <MatrixPlot report={report} locale={locale}/>
      <div className="qc-matrix-legend">
        <span><i className="qc-status-ok"/>{fr?'Sans indicateur':'No flag'}</span>
        <span><i className="qc-status-flat"/>{fr?'Signal plat':'Flat signal'}</span>
        <span><i className="qc-status-high"/>{fr?'Amplitude relative élevée':'Relative amplitude'}</span>
        <span><i className="qc-status-mark"/>{fr?'Marquage manuel':'Manual marking'}</span>
      </div>
      <p className="note">{fr?
        'Les fenêtres affichées peuvent être regroupées horizontalement pour préserver la lisibilité. Le CSV conserve toutes les fenêtres individuelles. Une couleur représente un indicateur de dépistage, pas un diagnostic.':
        'Time windows may be aggregated horizontally for readability. The CSV retains every individual window. Colours indicate screening flags, not diagnoses.'}</p>
      <div className="scroll-table qc-matrix-table">
        <table><thead><tr>
          <th>{fr?'Canal':'Channel'}</th><th>{fr?'Type':'Type'}</th>
          <th>{fr?'Fenêtres':'Windows'}</th><th>{fr?'Amplitude':'Amplitude'}</th>
          <th>{fr?'Plat':'Flat'}</th><th>{fr?'Manuel':'Manual'}</th>
          <th>{fr?'Total signalé':'Total flagged'}</th><th>{fr?'Inspection':'Inspection'}</th>
        </tr></thead><tbody>
          {rows.map(row=>{
            const ch=report.channel_results.find(c=>c.name===row.channel)!
            const selected=ch.windows.find(w=>w.relative_high_amplitude||
              w.relative_flat||w.manually_excluded)||ch.windows[0]
            return <tr key={row.channel}>
              <td><strong>{row.channel}</strong>{row.marked_bad?' †':''}</td>
              <td>{row.modality}</td><td>{row.windows}</td><td>{row.high}</td>
              <td>{row.flat}</td><td>{row.manual}</td><td>{row.flagged}</td>
              <td><button className="outline" disabled={!selected}
                onClick={()=>selected&&onInspect(row.channel,selected.start,selected.end)}>
                <Search size={14}/>{fr?'Inspecter':'Inspect'}</button></td>
            </tr>
          })}
        </tbody></table>
      </div>
      <p className="note">{fr?'† Canal marqué manuellement. Les échantillons originaux ne sont jamais modifiés.':
        '† Channel marked manually. The original samples are never modified.'}</p>
    </> : <div className="empty-state"><ShieldCheck size={28}/>
      <h3>{fr?'Diagnostic exploratoire multicanal':'Exploratory multichannel screening'}</h3>
      <p>{fr?'Cliquez sur « Analyser tous les canaux » pour obtenir une carte temporelle, des indicateurs par voie et un export exhaustif.':
        'Run the all-channel scan for a temporal quality map, per-channel indicators and complete export.'}</p>
    </div>}
  </section>
}
