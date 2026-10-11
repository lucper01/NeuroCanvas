import { Activity, ArrowRight, BrainCircuit, FileUp, Layers3, Radio, ScanLine } from 'lucide-react'
import { useMemo } from 'react'
import type { RecordingInfo, Spectrum, Trace } from './types'
import type { Language } from './localization'

const BANDS = [
  { label:'DELTA', range:[.5,4], color:'#56c7e6', symbol:'δ' },
  { label:'THETA', range:[4,8], color:'#9b84ff', symbol:'θ' },
  { label:'ALPHA', range:[8,13], color:'#ff8cae', symbol:'α' },
  { label:'BETA', range:[13,30], color:'#54ddb8', symbol:'β' },
  { label:'GAMMA', range:[30,45], color:'#edb778', symbol:'γ' }
] as const

function NeuralArtwork() {
  const grooves=[
    'M129 105 Q91 114 101 145 Q108 154 103 167',
    'M148 80 Q121 95 139 123 Q151 138 143 157',
    'M170 80 Q161 100 182 109 Q204 112 201 132',
    'M193 94 Q216 109 214 140 Q207 156 218 179',
    'M115 179 Q147 174 147 196 Q160 209 181 199',
    'M148 128 Q164 145 156 162 Q153 179 167 190',
    'M208 84 Q223 79 236 105 Q254 109 261 130',
    'M247 97 Q257 122 241 140 Q260 150 268 174',
    'M229 176 Q244 164 263 188 Q287 190 294 176',
    'M286 108 Q301 120 288 145 Q309 164 294 180',
    'M309 121 Q330 125 325 152 Q345 172 321 191',
    'M172 212 Q199 204 202 224 Q216 238 231 220',
    'M234 202 Q249 219 244 231 Q265 240 284 212',
    'M268 110 Q274 95 292 103 Q294 110 298 117',
    'M112 130 Q129 132 124 156 Q115 164 120 177'
  ]
  return <div className="neuro-brain-art" aria-hidden="true">
    <svg viewBox="0 0 450 320" role="img">
      <defs>
        <radialGradient id="brainAura"><stop stopColor="#ff4e78" stopOpacity=".48"/><stop offset=".6" stopColor="#f74b88" stopOpacity=".11"/><stop offset="1" stopColor="#f74b88" stopOpacity="0"/></radialGradient>
        <radialGradient id="brainMain" cx=".25" cy=".26" r=".9">
          <stop stopColor="#b6a7c6"/><stop offset=".38" stopColor="#736881"/><stop offset=".8" stopColor="#353544"/><stop offset="1" stopColor="#1b2434"/>
        </radialGradient>
        <radialGradient id="brainActive" cx=".88" cy=".35" r=".68">
          <stop stopColor="#ffb4d2"/><stop offset=".22" stopColor="#fa567d"/><stop offset=".55" stopColor="#af3459"/><stop offset="1" stopColor="#473044" stopOpacity=".45"/>
        </radialGradient>
        <linearGradient id="brainStem" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#7e7489"/><stop offset="1" stopColor="#242b38"/>
        </linearGradient>
        <filter id="brainBlur"><feGaussianBlur stdDeviation="17"/></filter>
        <filter id="brainGlow"><feGaussianBlur stdDeviation="3"/></filter>
      </defs>
      <circle cx="292" cy="139" r="124" fill="url(#brainAura)"/>
      <ellipse cx="224" cy="272" rx="160" ry="26" fill="none" stroke="#3ac7d8" strokeOpacity=".4" strokeWidth="1.3"/>
      <ellipse cx="224" cy="272" rx="123" ry="13" fill="none" stroke="#68c8fa" strokeOpacity=".13"/>
      <path d="M225 224 C213 240 210 263 221 280 Q236 289 249 278 Q239 251 243 223" fill="url(#brainStem)" stroke="#a8a1b9" strokeOpacity=".5" strokeWidth="1.5"/>
      <path d="M148 211 Q100 209 94 181 Q74 159 91 141 Q80 121 102 104 Q106 83 129 82 Q134 56 162 65 Q187 46 205 69 Q230 47 250 72 Q269 59 287 80 Q311 72 323 98 Q350 100 345 126 Q362 143 348 166 Q352 190 327 204 Q308 225 279 220 Q252 248 224 225 Q192 240 167 219 Q157 220 148 211Z" fill="url(#brainMain)" stroke="#d8c8dd" strokeOpacity=".7" strokeWidth="2"/>
      <path d="M224 70 C247 65 263 69 287 80 Q311 72 323 98 Q350 100 345 126 Q362 143 348 166 Q352 190 327 204 Q310 221 278 220 Q255 238 235 229 Q223 206 239 181 Q219 161 239 140 Q220 120 227 103Z" fill="url(#brainActive)" opacity=".88"/>
      <path d="M223 74 Q227 126 221 160 Q213 198 228 224" fill="none" stroke="#e3cddd" strokeOpacity=".46" strokeWidth="3"/>
      {grooves.map((d,i)=><path key={i} d={d} fill="none" stroke={i>6?'#ffabc3':'#cfc5d8'} strokeWidth={i>6?2.5:2.1} strokeLinecap="round" opacity={i>6?.68:.48}/>)}
      <path d="M266 122 Q286 143 285 160 Q291 168 319 160" fill="none" stroke="#ffafc9" strokeWidth="7" opacity=".7" filter="url(#brainGlow)"/>
      <path d="M274 128 Q285 140 285 160 Q302 173 319 157" fill="none" stroke="#ffe1e9" strokeWidth="1.8" opacity=".93"/>
      <ellipse cx="294" cy="150" rx="40" ry="48" fill="#f64a83" opacity=".24" filter="url(#brainBlur)"/>
      {[0,1,2,3,4].map(i=><g key={i} stroke={i%2?'#8bd2ff':'#b68dff'} strokeOpacity=".38" strokeWidth="1">
        <line x1={75+i*68} x2={100+i*55} y1={275+i%2*4} y2={248+i%3*3}/>
        <circle cx={75+i*68} cy={275+i%2*4} r="2.6" fill={i%2?'#8bd2ff':'#b68dff'}/>
      </g>)}
      <path d="M70 268 H375" stroke="#68d4e9" strokeOpacity=".16" strokeDasharray="2 7"/>
      <circle cx="292" cy="147" r="54" stroke="#ff7fa4" strokeOpacity=".15" fill="none"/>
      <circle cx="292" cy="147" r="75" stroke="#ff7fa4" strokeOpacity=".08" fill="none"/>
    </svg>
  </div>
}

function Sparkline({values,color}: {values:number[];color:string}) {
  const d=useMemo(()=>{
    if(!values.length)return ''
    const step=Math.max(1,Math.ceil(values.length/110))
    const points=values.filter((_,i)=>i%step===0)
    let low=Math.min(...points),high=Math.max(...points)
    if(!Number.isFinite(low)||!Number.isFinite(high))return ''
    if(high-low<1e-16){low-=1;high+=1}
    return points.map((v,i)=>{
      const x=i/Math.max(1,points.length-1)*270
      const y=44-(v-low)/(high-low)*31
      return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)
    }).join(' ')
  },[values])
  return <svg className="neuro-sparkline" viewBox="0 0 270 52" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 43 H270 M0 22 H270" fill="none" stroke="#ffffff" strokeOpacity=".055" strokeDasharray="3 5"/>
    <path d={d} stroke={color} strokeWidth="1.8" fill="none" vectorEffect="non-scaling-stroke"
      strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}

type Props={
  locale:Language
  info:RecordingInfo|null
  traces:Trace[]
  psd:Spectrum|null
  onExplore:()=>void
  onImport:()=>void
  onTriggers:()=>void
}
export default function NeuroDashboard({locale,info,traces,psd,onExplore,onImport,onTriggers}:Props){
  const french=locale==='fr'
  const frequency = psd?.frequency||[]
  const density=psd?.psd||[]
  const df=frequency.length>1?frequency[1]-frequency[0]:0
  const active=BANDS.map(b=>{
    const indices=frequency.map((f,i)=>f>=b.range[0]&&f<b.range[1]?i:-1).filter(i=>i>=0)
    const power=indices.reduce((total,i)=>total+Math.max(0,density[i])*df,0)
    const values=indices.map(i=>density[i])
    return {...b,power,values}
  })
  const total=active.reduce((sum,b)=>sum+b.power,0)
  const synthetic=!!info?.source && /synthetic/i.test(info.source)
  return <div className="neuro-command-dashboard">
    <div className="neuro-command-header">
      <div><div className="neuro-command-eyebrow"><span className="neuro-live-dot"/> {french?'ESPACE D’EXPLORATION':'SIGNAL EXPLORATION'}</div>
        <h2>{french?'Vue neuroscientifique':'Neuroscience overview'}</h2>
        <p>{info?.name||'NeuroCanvas'} · {synthetic?(french?'Données synthétiques':'Synthetic data'):(french?'Données acquises':'Recorded data')}</p>
      </div>
      <div className="neuro-command-actions">
        <button className="outline" onClick={onTriggers}><Radio size={16}/>{french?'Triggers & époques':'Triggers & epochs'}</button>
        <button className="primary" onClick={onImport}><FileUp size={16}/>{french?'Importer':'Import'}</button>
      </div>
    </div>
    <div className="neuro-command-primary">
      <div className="neuro-brain-panel">
        <div className="neuro-panel-header"><span><BrainCircuit size={15}/>{french?'EXPLORATEUR NEURAL':'NEURAL EXPLORER'}</span>
          <span className="neuro-status-chip"><span/> {french?'VISUALISATION':'VISUALIZATION'}</span></div>
        <NeuralArtwork/>
        <div className="neuro-brain-footer"><span><ScanLine size={15}/> {french?'Illustration conceptuelle':'Conceptual illustration'}</span>
          <span>EEG · ECG · EDA · RSP</span></div>
      </div>
      <div className="neuro-command-right">
        <div className="neuro-data-panel">
          <div className="neuro-panel-header"><span><Activity size={15}/> {french?'SIGNAUX ACTIFS':'ACTIVE SIGNAL STREAMS'}</span>
            <span className="neuro-panel-hint">{traces.length} {french?'voies':'channels'}</span></div>
          <div className="neuro-wave-rows">
            {traces.slice(0,4).map((trace,i)=><div key={trace.name} className="neuro-wave-row">
              <div><strong style={{color:['#67d9ff','#a590ff','#ff83b0','#61d7b7'][i]}}>{trace.name}</strong>
                <small>{trace.unit||'a.u.'}</small></div>
              <Sparkline values={trace.y} color={['#67d9ff','#a590ff','#ff83b0','#61d7b7'][i]}/>
            </div>)}
            {!traces.length&&<p className="neuro-empty">{french?'Chargement des signaux…':'Loading signals…'}</p>}
          </div>
        </div>
        <div className="neuro-spectrum-panel">
          <div className="neuro-panel-header"><span><Layers3 size={15}/> {french?'PROFIL SPECTRAL':'SPECTRAL PROFILE'}</span>
            <span className="neuro-panel-hint">{psd?.unit||'PSD'}</span></div>
          <div className="neuro-spectrum-bars">
            {active.map(b=><div className="neuro-spectrum-bar" key={b.label}>
              <span style={{color:b.color}}>{b.label}</span>
              <div><i style={{width:(total>0?Math.max(2,b.power/total*100):0)+'%',background:b.color}}/></div>
              <small>{total>0?(b.power/total*100).toFixed(1)+'%':'—'}</small>
            </div>)}
          </div>
          <p>{french?'Part relative de chaque bande dans la puissance intégrée (0,5–45 Hz). Aucun état cognitif inféré.':
            'Relative contribution to integrated 0.5–45 Hz power. No cognitive state inferred.'}</p>
        </div>
      </div>
    </div>
    <div className="neuro-band-cards">
      {active.map(b=><button className="neuro-band-card" key={b.label} onClick={onExplore}>
        <div className="neuro-band-header"><span>{b.label}</span><span style={{color:b.color}}>{b.symbol}</span></div>
        <strong>{b.range[0]}–{b.range[1]} <small>Hz</small></strong>
        <small>{total>0?(b.power/total*100).toFixed(1)+'%': '—'} {french?'relatif':'relative'}</small>
        <Sparkline values={b.values} color={b.color}/>
        <span className="neuro-band-foot">{french?'Examiner le spectre':'Inspect spectrum'} <ArrowRight size={12}/></span>
      </button>)}
    </div>
    <div className="neuro-command-footer">
      <span><span className="neuro-live-dot"/>{french?'Données affichées depuis la session active':'Data shown from active session'}</span>
      <button onClick={onExplore}>{french?'Ouvrir l’explorateur':'Open signal explorer'} <ArrowRight size={14}/></button>
    </div>
  </div>
}
