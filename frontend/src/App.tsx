import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import Plotly from 'plotly.js-dist-min'
import {
  Activity, BrainCircuit, ChartNoAxesCombined, CircleHelp, ClipboardList,
  Database, Download, FileDown, FileUp, Filter, FlaskConical, HeartPulse, Info,
  Layers3, Menu, Monitor, Plus, RefreshCw, RotateCcw, Save, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Wifi, WifiOff, X
} from 'lucide-react'
import type { Evoked, LocalRecording, QCReport, RecordingInfo, Spectrum, Step, TimeFrequency, Trace } from './types'
import { qualityWindows, validateMarkedSegment } from './qc'
import { loadPreferences, savePreferences, resolveLanguage, localizeTree } from './localization'
import type { Preferences } from './localization'
import { demo, importCSV, applySteps, viewport, spectrum, spectrogram, erp, fourier } from './engine'
import { api } from './api'

type Section = 'overview' | 'explorer' | 'processing' | 'frequency' | 'physiology' | 'advanced' | 'artifact' | 'learning' | 'export' | 'help'
const TABS: { id: Section; title: string; subtitle: string; icon: typeof Activity }[] = [
  { id: 'overview', title: 'Overview', subtitle: 'Tableau de bord', icon: Layers3 },
  { id: 'explorer', title: 'Signal Explorer', subtitle: 'Exploration temporelle', icon: Activity },
  { id: 'processing', title: 'Signal Processing', subtitle: 'Pipeline non destructif', icon: SlidersHorizontal },
  { id: 'frequency', title: 'Frequency Lab', subtitle: 'Spectres & temps-fréquence', icon: ChartNoAxesCombined },
  { id: 'physiology', title: 'Neurophysiology', subtitle: 'ERP & biosignaux', icon: HeartPulse },
  { id: 'advanced', title: 'Advanced Analysis', subtitle: 'MNE · ICA · QC · HRV', icon: BrainCircuit },
  { id: 'artifact', title: 'Artifact Review', subtitle: 'Contrôle qualité et exclusions', icon: ShieldCheck },
  { id: 'learning', title: 'Learning Studio', subtitle: 'Simulation pédagogique', icon: FlaskConical },
  { id: 'export', title: 'Export & Reproducibility', subtitle: 'Exports & provenance', icon: FileDown },
  { id: 'help', title: 'Documentation', subtitle: 'Méthodes & limites', icon: CircleHelp }
]

type PanelProps = { children: ReactNode; className?: string; title?: string; description?: string; trailing?: ReactNode }
function Panel({ children, title, description, trailing, className = '' }: PanelProps) {
  return <section className={'panel ' + className}>
    {(title || trailing) && <div className="panel-heading"><div>{title && <h3>{title}</h3>}{description && <p>{description}</p>}</div>{trailing}</div>}
    {children}
  </section>
}
function Plot({ traces, title, xTitle = 'Temps (s)', yTitle, shapes, heatmap = false, height = 350 }: {
  traces: unknown[]; title?: string; xTitle?: string; yTitle?: string; shapes?: unknown[]; heatmap?: boolean; height?: number
}) {
  const div = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!div.current) return
    const node = div.current
    const layout: Record<string, unknown> = {
      autosize: true, height, margin: { l: 65, r: 18, t: title ? 48 : 20, b: 55 },
      title: title ? { text: title, font: { size: 14, color: '#284a42' } } : undefined,
      paper_bgcolor: '#fff', plot_bgcolor: '#fff',
      xaxis: { title: { text: xTitle }, linecolor: '#cfded7', gridcolor: '#edf2ed', zeroline: false },
      yaxis: { title: { text: yTitle || '' }, gridcolor: '#edf2ed', zeroline: false },
      font: { family: 'Inter, system-ui, sans-serif', size: 11, color: '#61726d' },
      hovermode: heatmap ? 'closest' : 'x unified', legend: { orientation: 'h', y: -0.25 },
      shapes: shapes || []
    }
    void Plotly.react(node, traces, layout, { responsive: true, displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'] })
    return () => { Plotly.purge(node) }
  }, [traces, title, xTitle, yTitle, shapes, heatmap, height])
  const savePlot = async (format: 'png' | 'svg') => {
    if (!div.current) return
    try { await Plotly.downloadImage(div.current, { format, filename: 'neurocanvas_figure', height, width: 1200, scale: format === 'png' ? 2 : 1 }) }
    catch { /* Browser export can fail under strict CSP or embedded webviews. */ }
  }
  return <div className="plot-wrap"><div className="plot-actions">
    <button type="button" className="tiny" onClick={() => void savePlot('png')}>PNG</button>
    <button type="button" className="tiny" onClick={() => void savePlot('svg')}>SVG</button>
  </div><div ref={div} aria-label={title || 'Graphique scientifique interactif'} /></div>
}
function format(value: number, n = 2) { return Number.isFinite(value) ? value.toLocaleString('fr-FR', { maximumFractionDigits: n }) : '—' }
function saveBlob(contents: BlobPart, mime: string, name: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 3000)
}
function csvValue(value: string | number) {
  const s = String(value)
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
function useNotice() {
  const [notice, setNotice] = useState<{ message: string; kind: 'error' | 'ok' } | null>(null)
  const error = useCallback((e: unknown) => setNotice({ message: e instanceof Error ? e.message : String(e), kind: 'error' }), [])
  const success = useCallback((message: string) => setNotice({ message, kind: 'ok' }), [])
  return { notice, setNotice, error, success }
}
const COLORS = ['#187d68', '#bd8852', '#5479ad', '#ad6682', '#8573b8', '#56939a', '#a9a05f']

export default function App() {
  const [tab, setTab] = useState<Section>('overview')
  const [menu, setMenu] = useState(false)
  const [record, setRecord] = useState<LocalRecording>(() => demo())
  const [remote, setRemote] = useState<string | null>(null)
  const [remoteInfo, setRemoteInfo] = useState<RecordingInfo | null>(null)
  const [connected, setConnected] = useState(false)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<string[]>(['EEG Fz', 'EEG Cz'])
  const [channel, setChannel] = useState('EEG Fz')
  const [start, setStart] = useState(0)
  const [duration, setDuration] = useState(10)
  const [compare, setCompare] = useState(false)
  const [traces, setTraces] = useState<Trace[]>([])
  const [rawTraces, setRawTraces] = useState<Trace[]>([])
  const [psd, setPsd] = useState<Spectrum | null>(null)
  const [fftData, setFftData] = useState<{ frequency: number[]; amplitude: number[]; unit: string; method: string } | null>(null)
  const [spectralMethod, setSpectralMethod] = useState<'PSD' | 'FFT'>('PSD')
  const [tfr, setTfr] = useState<TimeFrequency | null>(null)
  const [evoked, setEvoked] = useState<Evoked | null>(null)
  const [physio, setPhysio] = useState<{ summary: Record<string, number>; markers: Record<string, number[]>; series: { name: string; time: number[]; values: (number | null)[] }[] } | null>(null)
  const [physiologyType, setPhysiologyType] = useState('ecg')
  const [eventLabel, setEventLabel] = useState('stimulus')
  const [eventTime, setEventTime] = useState(8)
  const [fsInput, setFsInput] = useState('')
  const [stepType, setStepType] = useState('filter')
  const [low, setLow] = useState('1')
  const [high, setHigh] = useState('40')
  const [notch, setNotch] = useState('50')
  const [alpha, setAlpha] = useState(10)
  const [noise, setNoise] = useState(1)
  const [demoRate, setDemoRate] = useState(250)
  const [demoTone, setDemoTone] = useState(20)
  const [showTfr, setShowTfr] = useState(false)
  const [advancedMode, setAdvancedMode] = useState('quality')
  const [advancedOutput, setAdvancedOutput] = useState<Record<string, unknown> | null>(null)
  const [altChannel, setAltChannel] = useState('EEG Cz')
  const [editType, setEditType] = useState('eeg')
  const [editUnit, setEditUnit] = useState('µV')
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [browserLanguage, setBrowserLanguage] = useState(() => typeof navigator !== 'undefined' ? navigator.language : 'en')
  const locale = resolveLanguage(preferences.language, browserLanguage)
  const [qcReport, setQcReport] = useState<QCReport | null>(null)
  const [qcWindowSeconds, setQcWindowSeconds] = useState(2)
  const [qcStart, setQcStart] = useState(4)
  const [qcEnd, setQcEnd] = useState(5)
  const [qcReason, setQcReason] = useState('Artéfact identifié visuellement')
  const [excludeMarked, setExcludeMarked] = useState(false)
  useEffect(() => {
    savePreferences(preferences)
    document.documentElement.lang = locale
  }, [preferences, locale])
  useEffect(() => {
    const handleLanguageChange = () => setBrowserLanguage(navigator.language)
    window.addEventListener('languagechange', handleLanguageChange)
    return () => window.removeEventListener('languagechange', handleLanguageChange)
  }, [])
  const fileInput = useRef<HTMLInputElement>(null)
  const sessionInput = useRef<HTMLInputElement>(null)
  const { notice, setNotice, error, success } = useNotice()
  const info = remote ? remoteInfo : record.info
  const sfreq = info?.sfreq || 250
  const channels = useMemo(() => info?.channels || [], [info])
  const steps = info?.history || []
  const events = useMemo(() => info?.events || [], [info])
  const selectedLabel = info?.name || 'Aucun enregistrement'
  const badChannels = info?.bad_channels || []
  const badSegments = info?.bad_segments || []

  const ping = useCallback(async () => {
    setChecking(true)
    try { await api.health(); setConnected(true); success('Moteur Python connecté : MNE et NeuroKit2 disponibles.') }
    catch { setConnected(false); setNotice({ kind: 'error', message: 'Moteur Python indisponible. Mode navigateur hors ligne toujours disponible.' }) }
    finally { setChecking(false) }
  }, [success, setNotice])
  useEffect(() => { void api.health().then(() => setConnected(true)).catch(() => setConnected(false)) }, [])

  const activate = (newInfo: RecordingInfo, id: string | null, local?: LocalRecording) => {
    if (local) setRecord(local)
    setRemote(id); setRemoteInfo(id ? newInfo : null)
    setSelection(newInfo.channels.slice(0, Math.min(newInfo.channels.length, 4)).map(x => x.name))
    setChannel(newInfo.channels[0]?.name || '')
    setStart(0); setDuration(Math.min(10, newInfo.duration || 10))
    setEventLabel(newInfo.events[0]?.label || 'stimulus')
    setQcReport(null); setExcludeMarked(false); setTraces([]); setRawTraces([]); setPsd(null); setFftData(null); setTfr(null); setEvoked(null); setPhysio(null); setAdvancedOutput(null)
  }
  const loadDemo = () => { const rec = demo(demoRate, 40, alpha, noise, demoTone); activate(rec.info, null, rec); success('Démonstration synthétique chargée.') }
  const loadPythonDemo = async () => {
    setBusy(true)
    try {
      const result = await api.demo()
      activate(result, result.session_id)
      success('Démo Python ouverte. Tous les traitements avancés sont disponibles.')
    } catch (e) { error(e) } finally { setBusy(false) }
  }
  const upload = async (file: File) => {
    setBusy(true)
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const loaded = JSON.parse(await file.text()) as LocalRecording
        if (!loaded.info || !Array.isArray(loaded.raw) || !loaded.raw.length || loaded.raw[0].length !== loaded.info.samples)
          throw Error('Session JSON incompatible.')
        if (loaded.raw.flat().some(x => !Number.isFinite(x))) throw Error('La session contient des valeurs non finies.')
        if (loaded.info.samples * loaded.raw.length > 20_000_000) throw Error('Session trop volumineuse.')
        const restored = applySteps({ ...loaded, processed: loaded.raw.map(x => [...x]) }, loaded.info.history || [])
        activate(restored.info, null, restored); success('Session locale restaurée.')
      } else if (connected) {
        const result = await api.upload(file, fsInput ? Number(fsInput) : undefined)
        activate(result, result.session_id); success('Fichier analysé dans le moteur scientifique Python.')
      } else if (/\.(csv|tsv)$/i.test(file.name)) {
        const result = importCSV(await file.text(), file.name, fsInput ? Number(fsInput) : undefined)
        activate(result.info, null, result); success('CSV chargé localement dans le navigateur.')
      } else throw Error('Ce format nécessite le moteur Python. Lancez le backend pour utiliser BDF, EDF, FIF, BrainVision, SET ou ACQ.')
      setTab('explorer')
    } catch (e) { error(e) } finally { setBusy(false) }
  }
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]
    if (file) void upload(file)
    e.currentTarget.value = ''
  }

  const loadTraces = useCallback(async () => {
    if (!info || !selection.length) return
    const maxStart = Math.max(0, info.duration - .001)
    const from = Math.min(Math.max(0, start), maxStart)
    const window = Math.max(.01, Math.min(duration, info.duration - from + 1 / sfreq))
    try {
      const result = remote ? await api.viewport(remote, selection, from, window) : viewport(record, selection, from, window)
      setTraces(result)
      if (compare) {
        const rawResult = remote ? await api.viewport(remote, selection, from, window, true) :
          viewport(record, selection, from, window, true)
        setRawTraces(rawResult)
      } else setRawTraces([])
    } catch (e) { error(e) }
  }, [remote, info, selection, start, duration, sfreq, record, compare, error])
  useEffect(() => { void loadTraces() }, [loadTraces])

  const loadSpectral = useCallback(async () => {
    if (!channel || !info) return
    try {
      const win = Math.max(.1, Math.min(duration, info.duration - start))
      const spectrumResult = remote ? await api.spectrum(remote, channel, start, win) : spectrum(record, channel, start, win)
      setPsd(spectrumResult)
      if (spectralMethod === 'FFT') {
        const fftResult = remote ? await api.fft(remote, channel, start, win) : fourier(record, channel, start, win)
        setFftData(fftResult)
      } else setFftData(null)
      if (showTfr) {
        const tf = remote ? await api.spectrogram(remote, channel, start, win) : spectrogram(record, channel, start, win)
        setTfr(tf)
      } else setTfr(null)
    } catch (e) { if (tab === 'frequency') error(e); setPsd(null); setFftData(null); setTfr(null) }
  }, [remote, channel, record, info, start, duration, showTfr, spectralMethod, tab, error])
  useEffect(() => { if (tab === 'frequency' || tab === 'overview') void loadSpectral() }, [loadSpectral, tab])

  const loadERP = async () => {
    try {
      const result = remote ? await api.erp(remote, channel, eventLabel, -.2, .8) : erp(record, channel, eventLabel, -.2, .8)
      setEvoked(result); success('Moyenne événementielle calculée.')
    } catch (e) { error(e); setEvoked(null) }
  }
  const runPhysiology = async () => {
    if (!remote) { error('Pour NeuroKit2, démarrer le moteur Python et importer les données via celui-ci.'); return }
    setBusy(true)
    try { setPhysio(await api.physiology(remote, channel, physiologyType)); success('NeuroKit2 : analyse terminée.') }
    catch (e) { error(e) } finally { setBusy(false) }
  }
  const runAdvanced = async () => {
    setBusy(true); setAdvancedOutput(null)
    try {
      const win = Math.max(.5, Math.min(duration, (info?.duration || 0) - start))
      if (advancedMode === 'quality') {
        if (remote) setAdvancedOutput(await api.quality(remote) as unknown as Record<string, unknown>)
        else {
          const rows = record.processed.map((row, i) => ({
            name: record.info.channels[i].name, unit: record.info.channels[i].unit,
            type: record.info.channels[i].type,
            mean: row.reduce((a,b)=>a+b,0)/row.length,
            min: row.slice(0,100000).reduce((a,b)=>Math.min(a,b),Infinity),
            max: row.slice(0,100000).reduce((a,b)=>Math.max(a,b),-Infinity),
            ptp: row.slice(0,100000).reduce((a,b)=>Math.max(a,b),-Infinity) -
              row.slice(0,100000).reduce((a,b)=>Math.min(a,b),Infinity),
            rms: Math.sqrt(row.reduce((a,b)=>a+b*b,0)/row.length)
          }))
          setAdvancedOutput({ channels:rows, flags:['Aperçu QC local : l’étendue est calculée sur les 100 000 premiers points.'] })
        }
      } else if (!remote) throw Error('Cette analyse avancée nécessite le moteur Python local.')
      else if (advancedMode === 'coherence') setAdvancedOutput(await api.coherence(remote, channel, altChannel, start, win))
      else if (advancedMode === 'mne-psd') setAdvancedOutput(await api.mnePSD(remote, start, win))
      else if (advancedMode === 'mne-epochs') setAdvancedOutput(await api.mneEpochs(remote, eventLabel))
      else if (advancedMode === 'montage') setAdvancedOutput(await api.montage(remote))
      else if (advancedMode === 'ica') setAdvancedOutput(await api.ica(remote, 10))
      else if (advancedMode === 'hrv') setAdvancedOutput(await api.hrv(remote, channel))
      success('Analyse avancée exécutée.')
    } catch (e) { error(e) } finally { setBusy(false) }
  }
  const editChannelMetadata = async () => {
    const idx = channels.findIndex(ch => ch.name === channel)
    if (idx < 0) { error('Canal absent.'); return }
    try {
      if (remote) setRemoteInfo(await api.editChannel(remote, idx, editType, editUnit))
      else setRecord(old => ({ ...old, info: { ...old.info,
        channels: old.info.channels.map((c,i)=>i===idx?{...c,type:editType,unit:editUnit}:c),
        warnings:[...old.info.warnings,'Métadonnées éditées : valeurs numériques NON converties.'] } }))
      success('Classification et unité déclarée modifiées, sans recalibrage numérique.')
    } catch (e) { error(e) }
  }

  const addStep = async () => {
    if (!selection.length) { error('Sélectionner au moins un canal avant d’appliquer un traitement.'); return }
    const newStep: Step = { method: stepType, channels: [...selection] }
    if (stepType === 'filter') {
      newStep.low = low.trim() ? Number(low) : null
      newStep.high = high.trim() ? Number(high) : null
    }
    if (stepType === 'notch') { newStep.frequency = Number(notch); newStep.quality = 30 }
    const nextSteps = [...steps, newStep]
    try {
      if (remote) setRemoteInfo(await api.pipeline(remote, nextSteps))
      else setRecord(applySteps(record, nextSteps))
      success('Traitement ajouté au pipeline ; signal brut conservé.')
    } catch (e) { error(e) }
  }
  const restore = async () => {
    try {
      if (remote) setRemoteInfo(await api.pipeline(remote, []))
      else setRecord(applySteps(record, []))
      success('Pipeline réinitialisé ; données brutes préservées.')
    } catch (e) { error(e) }
  }
  const removeStep = async (index: number) => {
    const updated = steps.filter((_, i) => i !== index)
    try {
      if (remote) setRemoteInfo(await api.pipeline(remote, updated))
      else setRecord(applySteps(record, updated))
    } catch (e) { error(e) }
  }
  const addMarker = async () => {
    try {
      if (!Number.isFinite(eventTime) || eventTime < 0 || eventTime > (info?.duration || 0)) throw Error('Événement hors enregistrement.')
      if (!eventLabel.trim()) throw Error('Indiquer une étiquette événementielle.')
      if (remote) setRemoteInfo(await api.addEvent(remote, eventTime, eventLabel))
      else setRecord({ ...record, info: { ...record.info, events: [...record.info.events,
        { time: eventTime, label: eventLabel, duration: 0 }].sort((a, b) => a.time - b.time) } })
      success('Événement enregistré.')
    } catch (e) { error(e) }
  }
  const exportMeta = () => saveBlob(JSON.stringify({ application: 'NeuroCanvas', version: '0.1.0', created_at: new Date().toISOString(),
    info, method: remote ? 'Python/SciPy/MNE/NeuroKit2' : 'JavaScript / educational preview',
    signal_units: info?.channels.map(c => ({ name: c.name, unit: c.unit, type: c.type })) }, null, 2), 'application/json', 'neurocanvas_provenance.json')
  const exportCSV = (raw = false) => {
    if (remote) { window.open(api.csvURL(remote, !raw), '_blank', 'noopener,noreferrer'); return }
    const header = ['time_s', ...record.info.channels.map(c => c.name)]
    const output = [header.map(csvValue).join(',')]
    for (let j = 0; j < record.info.samples; j++) {
      const row = [j / record.info.sfreq, ...(raw ? record.raw : record.processed).map(r => r[j])]
      output.push(row.map(csvValue).join(','))
    }
    saveBlob(output.join('\n'), 'text/csv;charset=utf-8', raw ? 'neurocanvas_raw.csv' : 'neurocanvas_processed.csv')
  }
  const exportSession = () => {
    if (remote) { error('Les sessions Python en mémoire ne sont pas sérialisées. Exporter les données CSV et la provenance JSON.'); return }
    saveBlob(JSON.stringify(record), 'application/json', 'neurocanvas_session.json')
  }
  const graphShapes = useMemo(() => events.filter(ev => ev.time >= start && ev.time <= start + duration).slice(0, 120)
    .map(ev => ({ type: 'line', x0: ev.time, x1: ev.time, y0: 0, y1: 1, yref: 'paper', line: { color: '#d4a46b', width: 1, dash: 'dot' } })), [events, start, duration])
  const signalTraces = useMemo(() => {
    const result: unknown[] = []
    const total = Math.max(1, traces.length)
    for (let i = 0; i < traces.length; i++) {
      const t = traces[i]
      const average = t.y.reduce((acc, v) => acc + v, 0) / Math.max(1, t.y.length)
      const spread = Math.max(1e-10, ...t.y.map(x => Math.abs(x - average)))
      const normalized = t.y.map(y => (y - average) / spread + (total - 1 - i) * 2.7)
      result.push({ x: t.x, y: normalized, customdata: t.y, name: t.name + ' (' + (t.unit || 'a.u.') + ')', type: 'scattergl',
        mode: 'lines', line: { color: COLORS[i % COLORS.length], width: 1.4 },
        hovertemplate: '%{x:.3f} s · %{customdata:.5g} ' + (t.unit || 'a.u.') + '<extra>' + t.name + '</extra>' })
      if (compare) {
        const rawTrace = rawTraces.find(x => x.name === t.name)
        if (rawTrace && rawTrace.x.length === t.x.length)
          result.push({ x: rawTrace.x, y: rawTrace.y.map(y => (y - average) / spread + (total - 1 - i) * 2.7),
            customdata: rawTrace.y, name: t.name + ' brut', type: 'scattergl', mode: 'lines',
            hovertemplate: '%{x:.3f} s · %{customdata:.5g} ' + (t.unit || 'a.u.') + '<extra>Brut : ' + t.name + '</extra>',
            line: { color: COLORS[i % COLORS.length], width: 1, dash: 'dot' } })
      }
    }
    return result
  }, [traces, compare, rawTraces])
  const bands = useMemo(() => {
    if (!psd) return []
    const defs = [{ name: 'δ', a: .5, b: 4 }, { name: 'θ', a: 4, b: 8 }, { name: 'α', a: 8, b: 13 },
      { name: 'β', a: 13, b: 30 }, { name: 'γ', a: 30, b: 45 }]
    const df = psd.frequency.length > 1 ? psd.frequency[1] - psd.frequency[0] : 0
    return defs.map(b => ({ ...b, power: psd.frequency.reduce((sum, f, i) => sum + (f >= b.a && f < b.b ? psd.psd[i] * df : 0), 0) }))
  }, [psd])

  return localizeTree(<div className={'shell density-' + preferences.density}>
    <aside className={'sidebar ' + (menu ? 'visible' : '')}>
      <div className="brand"><div className="brand-mark"><Activity size={24} strokeWidth={2.2} /></div>
        <div><strong>NeuroCanvas</strong><span>SCIENTIFIC SIGNAL STUDIO</span></div>
        <button className="mobile-close icon-button" onClick={() => setMenu(false)} aria-label="Fermer"><X size={18} /></button>
      </div>
      <div className="nav-heading">WORKSPACE</div>
      <nav>{TABS.map(item => {
        const Icon = item.icon
        return <button key={item.id} type="button" className={'nav-link ' + (tab === item.id ? 'active' : '')}
          onClick={() => { setTab(item.id); setMenu(false); setNotice(null) }}>
          <Icon size={19} strokeWidth={1.8} /><span>{item.title}</span>
          {tab === item.id && <span className="nav-current" />}
        </button>
      })}</nav>
      <div className="side-bottom"><div className={'connection ' + (connected ? 'online' : '')}>
        {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
        <div><strong>{connected ? 'Python engine ready' : 'Browser mode'}</strong>
          <small>{connected ? 'MNE · NeuroKit2 · SciPy' : 'Offline-capable exploration'}</small></div>
      </div><button className="plain" onClick={() => void ping()} disabled={checking}>
        <RefreshCw size={15} className={checking ? 'spin' : ''} /> Vérifier la connexion</button></div>
    </aside>

    {menu && <div className="overlay" onClick={() => setMenu(false)} />}
    {settingsOpen && <div className="preferences-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
      <section className="preferences-panel" role="dialog" aria-modal="true" aria-label="Personnalisation"
        onClick={event => event.stopPropagation()}>
        <div className="preferences-top"><div><small>NEUROCANVAS / SETTINGS</small>
          <h2>Personnalisation</h2></div>
          <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Fermer"><X size={20}/></button>
        </div>
        <div className="preferences-content">
          <div className="preferences-group"><h3>Langue de l’interface</h3>
            <p>Langue détectée : {browserLanguage}. {locale.toUpperCase()}</p>
            <div className="preference-options">
              {([
                { id:'auto', title:'Automatique (navigateur)', desc:'Automatic language detection' },
                { id:'fr', title:'Français', desc:'Interface en français' },
                { id:'en', title:'Anglais', desc:'English interface' }
              ] as const).map(item => <label key={item.id} className={'preference-choice ' +
                (preferences.language === item.id ? 'selected' : '')}>
                <input type="radio" name="language" value={item.id}
                  checked={preferences.language === item.id}
                  onChange={() => setPreferences(prev => ({...prev,language:item.id}))}/>
                <span><strong>{item.title}</strong><small>{item.desc}</small></span>
              </label>)}
            </div>
          </div>
          <div className="preferences-group"><h3>Densité de l’interface</h3>
            <div className="preference-options horizontal">
              {(['standard','compact'] as const).map(value=><label key={value}
                className={'preference-choice ' + (preferences.density === value ? 'selected' : '')}>
                <input type="radio" name="density" value={value}
                  checked={preferences.density === value}
                  onChange={() => setPreferences(prev => ({...prev,density:value}))}/>
                <span><strong>{value === 'standard' ? 'Standard' : 'Compact'}</strong></span>
              </label>)}
            </div>
          </div>
          <p className="preferences-note">Préférences enregistrées sur cet appareil.</p>
          <p className="preferences-note">La langue des enregistrements et des signaux ne sera pas modifiée.</p>
        </div>
        <button className="primary preferences-apply" onClick={() => setSettingsOpen(false)}>Appliquer</button>
      </section>
    </div>}
    <main className="main">
      <header className="topbar">
        <div className="top-left"><button className="mobile-menu icon-button" onClick={() => setMenu(true)} aria-label="Menu"><Menu size={22} /></button>
          <span className="breadcrumbs">Workspace <span>/</span> {TABS.find(x => x.id === tab)?.title}</span></div>
        <div className="top-right"><span className={'status-pill ' + (connected ? 'ready' : '')}>{connected ? 'PYTHON CONNECTED' : 'LOCAL BROWSER'}</span>
          <button className="outline small personalization-button" title="Ouvrir les préférences" aria-label="Personnalisation"
            onClick={() => setSettingsOpen(true)}><Settings2 size={16}/><span>Personnalisation</span><span className="language-mini">{locale.toUpperCase()}</span></button>
          <button className="primary small" onClick={() => fileInput.current?.click()}><FileUp size={15} /> Importer</button>
        </div>
      </header>
      <div className="workspace">
        <div className="page-heading"><div className="eyebrow">NEUROSCIENCE WORKBENCH / V0.1</div>
          <h1>{tab === 'overview' ? 'Your signal workspace' : TABS.find(x => x.id === tab)?.title}</h1>
          <p>{tab === 'overview' ? 'Explorer, comprendre et transformer des signaux biomédicaux dans un même environnement.'
            : TABS.find(x => x.id === tab)?.subtitle}</p>
        </div>
        {notice && <div role="status" className={'toast ' + notice.kind}><Info size={16}/><span>{notice.message}</span>
          <button onClick={() => setNotice(null)} aria-label="Fermer"><X size={15}/></button></div>}
        <input type="file" ref={fileInput} hidden accept=".csv,.tsv,.edf,.bdf,.fif,.vhdr,.set,.acq,.zip,.json" onChange={onFile} />
        <input type="file" ref={sessionInput} hidden accept=".json" onChange={onFile} />

        {tab === 'overview' && <>
          <div className="intro-banner">
            <div><span className="eyebrow light">EXPLORE THE UNSEEN</span><h2>From raw signals<br/>to scientific insight.</h2>
              <p>Un espace interactif pour visualiser l'activité physiologique, explorer ses composantes et documenter chaque traitement.</p>
              <div className="button-row"><button className="light-button" onClick={() => setTab('explorer')}>Explorer les signaux <span>→</span></button>
                <button className="light-outline" onClick={() => fileInput.current?.click()}><FileUp size={16}/> Ajouter un fichier</button></div>
            </div><div className="hero-graphic" aria-hidden="true"><svg viewBox="0 0 440 180" preserveAspectRatio="none">
              {Array.from({ length: 4 }, (_, i) => <path key={i} d={Array.from({ length: 160 }, (_, j) => {
                const x = j / 159 * 440
                const y = 35 + i * 34 + 9 * Math.sin(j * .23 + i) + 6 * Math.sin(j * .48 + i * 2)
                return (j ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
              }).join(' ')} fill="none" stroke={['#bce5d4', '#c7d8a4', '#c7dfe1', '#efe6ac'][i]} strokeWidth="1.9" opacity=".9"/> )}
              <line x1="276" x2="276" y1="0" y2="180" stroke="#e8ddac" strokeDasharray="3 5" opacity=".7"/>
            </svg></div>
          </div>
          <div className="stats-grid"><Metric title="Canaux actifs" value={String(channels.length)} sub="Voies disponibles" icon={<Activity size={20}/>}/>
            <Metric title="Échantillonnage" value={format(sfreq, 2) + ' Hz'} sub="Fréquence nominale" icon={<ChartNoAxesCombined size={20}/>}/>
            <Metric title="Durée totale" value={format(info?.duration || 0, 1) + ' s'} sub="Temps enregistré" icon={<Monitor size={20}/>}/>
            <Metric title="Événements" value={String(events.length)} sub="Marqueurs temporels" icon={<ClipboardList size={20}/>}/></div>
          <div className="columns-main"><Panel title="Signal preview" description={selectedLabel}
              trailing={<button className="text-button" onClick={() => setTab('explorer')}>Ouvrir <span>→</span></button>}>
              <Plot traces={signalTraces} shapes={graphShapes} height={330} yTitle="Canaux normalisés et décalés" />
            </Panel><Panel title="Start exploring" description="Actions rapides" className="right-panel">
              <div className="quick-actions">
                <button onClick={loadDemo}><Sparkles size={20}/><span><strong>Signaux de démonstration</strong><small>EEG · ECG · EDA · RSP · EMG</small></span>→</button>
                <button onClick={() => fileInput.current?.click()}><Database size={20}/><span><strong>Importer une acquisition</strong><small>CSV et formats scientifiques</small></span>→</button>
                <button onClick={() => setTab('processing')}><Filter size={20}/><span><strong>Traitement des signaux</strong><small>Filtres, référence, correction</small></span>→</button>
                <button onClick={() => setTab('learning')}><BrainCircuit size={20}/><span><strong>Laboratoire pédagogique</strong><small>Expérimenter les fréquences</small></span>→</button>
              </div></Panel></div>
        </>}

        {['explorer', 'processing', 'frequency', 'physiology', 'advanced'].includes(tab) && <div className="data-bar">
          <div><span className="tiny-label">ENREGISTREMENT ACTIF</span><strong>{selectedLabel}</strong>
            <small>{format(info?.duration || 0, 2)} s · {channels.length} canaux · {format(sfreq, 2)} Hz</small></div>
          <button className="outline small" onClick={() => fileInput.current?.click()}><FileUp size={15}/> Changer de fichier</button>
        </div>}

        {tab === 'explorer' && <>
          <div className="columns-main"><Panel title="Time-domain explorer" description="Défilement, zoom et marqueurs d'événements">
            <div className="toolbar"><label>Début (s)<input type="number" min="0" max={info?.duration} step=".1" value={start} onChange={e => setStart(Number(e.target.value) || 0)}/></label>
              <label>Fenêtre (s)<select value={duration} onChange={e => setDuration(Number(e.target.value))}>
                {[1,2,5,10,20,30,60].map(n => <option key={n} value={n}>{n} s</option>)}</select></label>
              <button className="outline" onClick={() => setStart(Math.max(0, start - duration))}>← Précédent</button>
              <button className="outline" onClick={() => setStart(Math.min(Math.max(0, (info?.duration || 0) - duration), start + duration))}>Suivant →</button>
              <label className="toggle"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)}/> Brut vs traité</label>
            </div>
            <Plot traces={signalTraces} shapes={graphShapes} height={480} yTitle="Canaux normalisés et décalés" />
            <div className="timeline"><input type="range" min="0" max={Math.max(0, (info?.duration || 0) - Math.min(duration, info?.duration || 0))}
              step=".05" value={Math.min(start, Math.max(0, (info?.duration || 0) - Math.min(duration, info?.duration || 0)))}
              onChange={e => setStart(Number(e.target.value))} aria-label="Déplacer la fenêtre temporelle"/>
              <div><span>0 s</span><span>{format(info?.duration || 0, 2)} s</span></div></div>
          </Panel><Panel title="Channel inspector" description="Sélection des voies" className="right-panel">
            <div className="channel-buttons"><button className="text-button" onClick={() => setSelection(channels.slice(0,16).map(c => c.name))}>Tout sélectionner</button>
              <button className="text-button" onClick={() => setSelection([])}>Effacer</button></div>
            <div className="channel-list">{channels.map((ch, i) => <label key={i} className="channel-row">
              <input type="checkbox" checked={selection.includes(ch.name)} onChange={e => setSelection(old =>
                e.target.checked ? [...old.filter(x => x !== ch.name), ch.name].slice(0,16) : old.filter(x => x !== ch.name))}/>
              <span className="channel-dot" style={{ background: COLORS[i % COLORS.length] }}/><span><strong>{ch.name}</strong><small>{ch.type} · {ch.unit}</small></span></label>)}</div>
            <p className="note">Jusqu'à 16 traces simultanées. L'échelle est normalisée par canal pour les superposer sans confondre les unités.</p>
          </Panel></div>
          <Panel title="Native amplitude" description="Valeurs mesurées dans leur unité physique déclarée, sans normalisation verticale">
            <div className="toolbar"><label>Canal<select value={channel} onChange={e => setChannel(e.target.value)}>
              {channels.map(c => <option key={c.name}>{c.name}</option>)}</select></label>
              <button className="outline" onClick={() => setSelection(old => old.includes(channel) ? old : [...old, channel].slice(0,16))}>
                Afficher ce canal</button></div>
            {traces.filter(x=>x.name===channel).map(trace => <Plot key={trace.name} title={trace.name} xTitle="Temps (s)"
              yTitle={'Amplitude (' + (trace.unit || 'a.u.') + ')'} height={260}
              traces={[{ type:'scattergl', mode:'lines', x:trace.x, y:trace.y, name:trace.name,
                line:{color:COLORS[0],width:1.5} }]}/>)}
          </Panel>
          <Panel title="Event annotations" description="Ajouter des marqueurs temporels pour explorer les réponses aux stimuli">
            <div className="toolbar"><label>Temps (s)<input type="number" step=".01" min="0" max={info?.duration} value={eventTime}
              onChange={e => setEventTime(Number(e.target.value))}/></label>
              <label>Étiquette<input value={eventLabel} onChange={e => setEventLabel(e.target.value)} /></label>
              <button className="primary" onClick={() => void addMarker()}><Plus size={16}/> Ajouter</button></div>
            <div className="event-chips">{events.slice(0,100).map((ev,i) => <span key={i}>{format(ev.time,2)} s · {ev.label}</span>)}{!events.length && <small>Aucun événement.</small>}</div>
          </Panel>
        </>}

        {tab === 'processing' && <div className="columns-main">
          <Panel title="Processing pipeline" description="Traitements successifs, entièrement recalculés depuis le signal brut">
            <div className="toolbar"><label>Opération<select value={stepType} onChange={e => setStepType(e.target.value)}>
              <option value="filter">Passe-haut / passe-bas</option><option value="notch">Notch secteur</option>
              <option value="demean">Soustraction de la moyenne</option><option value="detrend">Suppression tendance linéaire</option>
              <option value="rectify">Rectification |x|</option><option value="average_reference">Référence moyenne EEG</option>
            </select></label>
              {stepType === 'filter' && <><label>High-pass (Hz)<input type="number" step=".1" min="0" value={low} placeholder="Optionnel" onChange={e => setLow(e.target.value)}/></label>
                <label>Low-pass (Hz)<input type="number" step=".1" min="0" value={high} placeholder="Optionnel" onChange={e => setHigh(e.target.value)}/></label></>}
              {stepType === 'notch' && <label>Fréquence (Hz)<select value={notch} onChange={e => setNotch(e.target.value)}><option value="50">50 Hz</option><option value="60">60 Hz</option></select></label>}
              <button className="primary" onClick={() => void addStep()}><Plus size={16}/> Ajouter une étape</button>
              <button className="outline" onClick={() => void restore()}><RotateCcw size={16}/> Restaurer</button>
            </div>
            <p className="note">{remote ? 'Mode Python : filtres Butterworth SOS aller-retour (SciPy) pour les résultats scientifiques.'
              : 'Mode navigateur : filtres biquadratiques aller-retour à usage exploratoire ; utiliser Python pour valider les résultats.'}</p>
            <div className="steps">{steps.length ? steps.map((step,i) => <div key={i} className="step">
              <span className="step-index">{String(i+1).padStart(2,'0')}</span>
              <div><strong>{step.method}</strong><small>{step.low != null ? 'HP ' + step.low + ' Hz · ' : ''}{step.high != null ? 'LP ' + step.high + ' Hz · ' : ''}
                {step.frequency ? step.frequency + ' Hz · ' : ''}{step.channels?.join(', ') || 'Tous les canaux'}</small></div>
              <button onClick={() => void removeStep(i)} className="icon-button" aria-label={'Retirer étape ' + (i+1)}><Trash2 size={17}/></button>
            </div>) : <div className="empty-state"><Layers3 size={30}/><h3>Pipeline vierge</h3>
              <p>Le signal présenté est encore identique au signal d'origine. Ajoutez un traitement pour comparer.</p></div>}</div>
            <Plot traces={signalTraces} shapes={graphShapes} height={350} yTitle="Signaux filtrés, normalisés" />
          </Panel><Panel title="Channels to process" description="Appliquer aux voies sélectionnées" className="right-panel">
            <div className="channel-list">{channels.map(ch => <label className="channel-row" key={ch.name}>
              <input type="checkbox" checked={selection.includes(ch.name)} onChange={e => setSelection(old =>
                e.target.checked ? [...old.filter(x => x !== ch.name),ch.name] : old.filter(x => x !== ch.name))}/>
              <span><strong>{ch.name}</strong><small>{ch.type} · {ch.unit}</small></span></label>)}</div>
            <div className="hint"><ShieldCheck size={19}/><p>Les données originales sont conservées en mémoire et restent accessibles après chaque opération.</p></div>
          </Panel>
        </div>}

        {tab === 'frequency' && <>
          <Panel title="Spectral analysis" description="Densité spectrale de puissance par la méthode de Welch">
            <div className="toolbar"><label>Canal<select value={channel} onChange={e => setChannel(e.target.value)}>
              {channels.map(ch => <option key={ch.name}>{ch.name}</option>)}</select></label>
              <label>Début (s)<input type="number" value={start} min="0" step=".1" onChange={e=>setStart(Number(e.target.value))}/></label>
              <label>Durée (s)<input type="number" value={duration} min=".1" step=".1" onChange={e=>setDuration(Number(e.target.value))}/></label>
              <label>Méthode<select value={spectralMethod} onChange={e=>setSpectralMethod(e.target.value as 'PSD' | 'FFT')}>
                <option value="PSD">Welch · PSD</option><option value="FFT">Fourier · amplitude</option>
              </select></label>
              <label className="toggle"><input type="checkbox" checked={showTfr} onChange={e=>setShowTfr(e.target.checked)}/> Spectrogramme</label>
              <button className="outline" onClick={() => void loadSpectral()}><RefreshCw size={15}/> Actualiser</button>
            </div>
            {psd && spectralMethod === 'PSD' && <Plot title="Power spectral density (Welch)" xTitle="Fréquence (Hz)" yTitle={'PSD (' + psd.unit + ')'}
              traces={[{ type:'scatter', mode:'lines', x: psd.frequency, y: psd.psd, name: channel, line: { color: COLORS[0], width: 2 },
                fill:'tozeroy', fillcolor:'rgba(24,125,104,.09)' }]} height={365}/>}
            {fftData && spectralMethod === 'FFT' && <Plot title="FFT · spectre d'amplitude" xTitle="Fréquence (Hz)" yTitle={'Amplitude (' + fftData.unit + ')'}
              traces={[{ type:'scatter', mode:'lines', x:fftData.frequency, y:fftData.amplitude, name:channel,
                line:{ color:COLORS[0], width:1.5 } }]} height={365}/>}
            {tfr && <Plot title="Spectrogramme" xTitle="Temps (s)" yTitle="Fréquence (Hz)" heatmap height={390}
              traces={[{ type:'heatmap', x:tfr.time, y:tfr.frequency, z:tfr.power, colorscale:'Viridis',
                colorbar: { title: { text: tfr.unit } } }]}/>}
            <p className="note">{spectralMethod === 'FFT' ? (fftData?.method || 'FFT') : (psd ? psd.method + ' ; fenêtre de ' + psd.nperseg + ' échantillons.' : 'Sélectionner une fenêtre temporelle et un canal.')}
              {' '}Les puissances dépendent des unités et du référencement des données.</p>
          </Panel>
          <Panel title="EEG band power" description="Intégration numérique de la PSD selon les intervalles classiques (interprétation EEG uniquement)">
            <div className="band-grid">{bands.map(b => <div key={b.name} className="band">
              <strong>{b.name}</strong><small>{b.a}–{b.b} Hz</small><span>{b.power.toExponential(2)}</span></div>)}</div>
            <p className="note">Les bornes fréquentielles sont conventionnelles. Les bandes non couvertes par Nyquist présentent une puissance nulle. Ne pas interpréter ces résultats comme des biomarqueurs diagnostiques.</p>
          </Panel>
        </>}

        {tab === 'physiology' && <div className="columns-main">
          <Panel title="Event-related responses" description="Moyenne des époques alignées sur des marqueurs">
            <div className="toolbar"><label>Canal<select value={channel} onChange={e => setChannel(e.target.value)}>
              {channels.map(ch => <option key={ch.name}>{ch.name}</option>)}</select></label>
              <label>Événement<select value={eventLabel} onChange={e=>setEventLabel(e.target.value)}>
                {[...new Set(events.map(x=>x.label))].map(x=><option key={x}>{x}</option>)}
              </select></label><button className="primary" onClick={() => void loadERP()}><Activity size={16}/> Calculer ERP</button></div>
            {evoked ? <><div className="result-info">{evoked.n} époques incluses · {evoked.excluded} exclues (bornes)</div>
              <Plot title="Event-locked average" xTitle="Temps relatif (s)" yTitle={'Amplitude (' + evoked.unit + ')'} traces={[
                { type:'scatter', mode:'lines', name:'Moyenne', x:evoked.time, y:evoked.mean, line:{ color:COLORS[0], width:2 }},
                ...(evoked.n > 1 ? [{ type:'scatter', mode:'lines', name:'+ SEM', x:evoked.time, y:evoked.mean.map((v,i)=>v+(evoked.sem[i]||0)), line:{ width:0 }, showlegend:false },
                  { type:'scatter', mode:'lines', name:'± SEM', x:evoked.time, y:evoked.mean.map((v,i)=>v-(evoked.sem[i]||0)), fill:'tonexty',
                    fillcolor:'rgba(24,125,104,.14)', line:{ width:0 }}] : [])
              ]} /></> : <div className="empty-state"><Activity size={28}/><h3>Calculer une réponse moyenne</h3>
                <p>Les événements doivent être disponibles. Fenêtre fixe : −200 à +800 ms, avec correction de baseline pré-stimulus.</p></div>}
            <p className="note">La moyenne ne comporte pas encore de rejet automatique des artéfacts. Elle ne remplace pas une chaîne EEG validée.</p>
          </Panel><Panel title="NeuroKit2 processor" description="Traitements physiologiques spécialisés" className="right-panel">
            <div className="form-stack"><label>Modalité<select value={physiologyType} onChange={e=>setPhysiologyType(e.target.value)}>
              <option value="ecg">ECG · Détection QRS / HR</option><option value="eda">EDA · Tonic / Phasic</option>
              <option value="rsp">Respiration · Cycles</option><option value="emg">EMG · Enveloppe</option>
              <option value="ppg">PPG · Pics et fréquence</option><option value="eog">EOG · Clignements</option>
            </select></label><label>Canal<select value={channel} onChange={e=>setChannel(e.target.value)}>
              {channels.map(ch => <option key={ch.name}>{ch.name}</option>)}</select></label>
              <button className="primary" disabled={!remote || busy} onClick={() => void runPhysiology()}><BrainCircuit size={16}/> Analyser avec NeuroKit2</button></div>
            {!remote && <p className="note">Une session dans le moteur Python local est nécessaire pour cette analyse. Importez le fichier après connexion.</p>}
            {physio && <div className="physio-results"><h4>Mesures descriptives</h4>
              {Object.entries(physio.summary).map(([key,value]) => <div className="measure" key={key}><small>{key}</small><strong>{format(value,4)}</strong></div>)}
              <h4>Marqueurs détectés</h4>{Object.entries(physio.markers).map(([key,list])=><div className="measure" key={key}><small>{key}</small><strong>{list.length}</strong></div>)}</div>}
          </Panel>
          {physio && <Panel title="Physiological derived signals" className="span-both">
            {physio.series.slice(0,3).map(s => <Plot key={s.name} title={s.name} traces={[{ type:'scattergl', mode:'lines', x:s.time, y:s.values,
              line:{color:COLORS[0]} }]} height={235}/>)}
          </Panel>}
        </div>}

        {tab === 'advanced' && <>
          <Panel title="Advanced scientific analysis" description="Contrôles qualité, connectivité spectrale, analyses MNE et variabilité cardiaque">
            <div className="toolbar"><label>Analyse<select value={advancedMode} onChange={e => { setAdvancedMode(e.target.value); setAdvancedOutput(null) }}>
              <option value="quality">Quality control · tous signaux</option>
              <option value="coherence">Coherence · deux canaux</option>
              <option value="mne-psd">MNE · PSD EEG multicanal</option>
              <option value="mne-epochs">MNE · Epochs & Evoked EEG</option>
              <option value="montage">MNE · Montage 10-20 standard</option>
              <option value="ica">MNE · ICA exploratory preview</option>
              <option value="hrv">NeuroKit2 · HRV à partir ECG</option>
            </select></label>
            {['coherence','hrv'].includes(advancedMode) && <label>Canal<select value={channel} onChange={e=>setChannel(e.target.value)}>
              {channels.map(c=><option key={c.name}>{c.name}</option>)}</select></label>}
            {advancedMode === 'coherence' && <label>Second canal<select value={altChannel} onChange={e=>setAltChannel(e.target.value)}>
              {channels.map(c=><option key={c.name}>{c.name}</option>)}</select></label>}
            {advancedMode === 'mne-epochs' && <label>Événement<select value={eventLabel} onChange={e=>setEventLabel(e.target.value)}>
              {[...new Set(events.map(e=>e.label))].map(x=><option key={x}>{x}</option>)}</select></label>}
            <button className="primary" disabled={busy || (!connected && advancedMode !== 'quality')}
              onClick={() => void runAdvanced()}><BrainCircuit size={16}/> Lancer l’analyse</button>
          </div>
          {!remote && <p className="note">Importer les données via le moteur Python local pour accéder aux analyses MNE et NeuroKit2. Un aperçu QC peut fonctionner directement dans le navigateur.</p>}
          {advancedOutput ? <AdvancedResults mode={advancedMode} output={advancedOutput}/>
            : <div className="empty-state"><BrainCircuit size={28}/><h3>Scientific analysis workspace</h3>
              <p>Sélectionner une méthode, contrôler les métadonnées et lancer les calculs.</p></div>}
        </Panel>
        <Panel title="Channel classification & units" description="Assigner les types de capteurs et unités nécessaires aux analyses scientifiques">
          <div className="toolbar"><label>Canal<select value={channel} onChange={e=>setChannel(e.target.value)}>{channels.map(c=><option key={c.name}>{c.name}</option>)}</select></label>
            <label>Type<select value={editType} onChange={e=>setEditType(e.target.value)}>
              {['eeg','eog','ecg','emg','resp','misc','stim','bio','seeg','ecog'].map(x=><option key={x}>{x}</option>)}
            </select></label>
            <label>Unité déclarée<select value={editUnit} onChange={e=>setEditUnit(e.target.value)}>
              {['V','mV','µV','a.u.','µS','°C','%','bpm'].map(x=><option key={x}>{x}</option>)}
            </select></label><button className="outline" onClick={() => void editChannelMetadata()}><Settings2 size={15}/> Mettre à jour</button>
          </div>
          <p className="note"><strong>Attention :</strong> changer une unité dans ces métadonnées ne multiplie pas les valeurs par un facteur de conversion. Les données CSV doivent déjà être exprimées dans l’unité choisie. Les fonctions MNE acceptent les voies EEG annotées en V, mV ou µV.</p>
        </Panel>
        </>}

        {tab === 'learning' && <>
          <Panel title="Signal synthesis laboratory" description="Manipuler des paramètres et voir leurs conséquences sur l'activité synthétique">
            <div className="learning-controls"><label>Fréquence oscillatoire alpha <strong>{alpha} Hz</strong>
              <input type="range" min="6" max="15" value={alpha} step=".5" onChange={e=>setAlpha(Number(e.target.value))}/></label>
              <label>Amplitude du bruit <strong>× {format(noise,1)}</strong>
                <input type="range" min="0" max="5" value={noise} step=".1" onChange={e=>setNoise(Number(e.target.value))}/></label>
              <label>Seconde oscillation <strong>{demoTone} Hz</strong>
                <input type="range" min="5" max="140" value={demoTone} step="1" onChange={e=>setDemoTone(Number(e.target.value))}/></label>
              <label>Échantillonnage <strong>{demoRate} Hz</strong>
                <select value={demoRate} onChange={e=>setDemoRate(Number(e.target.value))}>
                  {[64,100,128,250,500,1000].map(hz=><option key={hz} value={hz}>{hz} Hz</option>)}
                </select></label>
              <button className="primary" onClick={loadDemo}><Sparkles size={16}/> Régénérer les signaux</button>
              {connected && <button className="outline" disabled={busy} onClick={() => void loadPythonDemo()}>Démo scientifique Python</button>}</div>
            {demoTone >= demoRate/2 && <div className="toast error"><Info size={16}/>
              <span>Risque de repliement spectral : l'oscillation de {demoTone} Hz dépasse Nyquist ({format(demoRate/2,1)} Hz).
              Régénérez les données et examinez la PSD pour observer l'aliasing.</span></div>}
            <Plot title="Exemple de signaux multicanaux synthétiques" traces={signalTraces} height={395} yTitle="Canaux normalisés et décalés"/>
          </Panel>
          <div className="learning-grid">{[
            { title: 'Échantillonnage et Nyquist', text: 'Comparer les fréquences du signal et la fréquence d’échantillonnage. Un contenu au-delà de Fs/2 provoque un risque de repliement spectral.' },
            { title: 'Bruit et artéfacts', text: 'Observer la dégradation du rapport signal/bruit et les conséquences d’un artefact musculaire sur le spectre.' },
            { title: 'Filtrage numérique', text: 'Étudier l’effet des coupures, de l’ordre du filtre et des déformations introduites aux bords.' },
            { title: 'Événements et moyennage', text: 'Comprendre pourquoi l’alignement temporel et le nombre d’essais modifient la précision des réponses moyennes.' },
            { title: 'Unités et interprétation', text: 'Distinguer les unités natives des signaux, leurs transformations et les normalisations uniquement visuelles.' },
            { title: 'Variabilité physiologique', text: 'Explorer les différences entre signaux périodiques, événements transitoires et fluctuations autonomiques.' }
          ].map(item => <Panel key={item.title} title={item.title}><p>{item.text}</p></Panel>)}</div>
          <div className="hint"><FlaskConical size={20}/><p>Les données de formation sont synthétiques. Elles ne doivent pas être utilisées pour valider un algorithme destiné à des enregistrements réels.</p></div>
        </>}

        {tab === 'export' && <>
          <div className="export-grid"><Panel title="Processed data" description="Matrice multicanal au format tabulaire">
            <div className="export-icon"><Database size={28}/></div><p>Exporter les échantillons traités avec l'axe temporel en secondes.</p>
            <div className="button-row"><button className="primary" onClick={() => exportCSV(false)}><Download size={16}/> CSV traité</button>
              <button className="outline" onClick={() => exportCSV(true)}><Database size={16}/> CSV brut</button></div></Panel>
            <Panel title="Scientific provenance" description="Traçabilité du traitement">
              <div className="export-icon"><ClipboardList size={28}/></div><p>Métadonnées, fréquence, unités, marqueurs et pipeline d'analyse dans un JSON lisible.</p>
              <button className="primary" onClick={exportMeta}><Download size={16}/> Télécharger provenance</button></Panel>
            <Panel title="Portable session" description="Session autonome du navigateur">
              <div className="export-icon"><Save size={28}/></div><p>Sauvegarder tous les signaux bruts, événements et traitements dans un JSON réimportable.</p>
              <button className="outline" disabled={!!remote} onClick={exportSession}><Save size={16}/> Sauvegarder session</button></Panel></div>
          <Panel title="Recording audit trail" description="Opérations appliquées à la session">
            <div className="summary-list"><div><span>Origine</span><strong>{info?.source}</strong></div>
              <div><span>Nom</span><strong>{selectedLabel}</strong></div>
              <div><span>Échantillons par voie</span><strong>{format(info?.samples || 0,0)}</strong></div>
              <div><span>Fréquence</span><strong>{format(sfreq)} Hz</strong></div>
              <div><span>Traitements</span><strong>{steps.length}</strong></div>
              <div><span>Marqueurs</span><strong>{events.length}</strong></div>
              <div><span>Moteur</span><strong>{remote ? 'Python / SciPy' : 'JavaScript navigateur'}</strong></div></div>
            <pre className="code-preview">{JSON.stringify(steps, null, 2)}</pre>
          </Panel>
        </>}

        {tab === 'help' && <>
          <Panel title="Getting started" description="NeuroCanvas combine exploration web et analyse scientifique locale">
            <div className="help-grid"><div><h4>1. Démarrer</h4><p>Ouvrir la démonstration, ou importer un fichier CSV/TSV. En l'absence de colonne temporelle, saisir la fréquence d'échantillonnage.</p></div>
              <div><h4>2. Connecter Python</h4><p>Installer les dépendances Python puis lancer uvicorn sur 127.0.0.1:8000. L'interface détecte automatiquement la disponibilité du moteur.</p></div>
              <div><h4>3. Explorer</h4><p>Sélectionner les voies, parcourir l'enregistrement, ajouter des marqueurs, puis appliquer les traitements.</p></div>
              <div><h4>4. Documenter</h4><p>Exporter les données transformées et la provenance. Conserver séparément les acquisitions originales.</p></div></div>
            <pre className="code-preview">{"cd backend\npython -m venv .venv\n# activer .venv selon votre système\npip install -r requirements.txt\nuvicorn main:app --host 127.0.0.1 --port 8000"}</pre>
            <button className="outline" onClick={() => void ping()}><RefreshCw size={15}/> Tester le moteur Python</button>
          </Panel>
          <Panel title="Formats, standards et limites">
            <div className="help-grid"><div><h4>Formats pris en charge</h4><p>Mode web : CSV/TSV, session JSON. Mode Python : CSV, TSV, EDF, BDF, FIF, BrainVision VHDR, EEGLAB SET, ACQ avec bioread, et ZIP pour jeux de fichiers associés.</p></div>
              <div><h4>Interopérabilité</h4><p>MNE-Python lit les formats d'électrophysiologie ; NeuroKit2 traite ECG, EDA, respiration, EMG, PPG et EOG ; SciPy exécute les traitements numériques.</p></div>
              <div><h4>Traçabilité</h4><p>Chaque transformation s'applique à une copie. Le pipeline est recalculé depuis les données brutes. Les métadonnées doivent conserver Fs et unités.</p></div>
              <div><h4>Limites scientifiques</h4><p>L'ERP simple ne rejette pas les artéfacts, les filtres web sont illustratifs, les sessions Python sont en mémoire et les mesures de NeuroKit2 demandent un contrôle de qualité.</p></div></div>
          </Panel><div className="hint"><ShieldCheck size={20}/><p>NeuroCanvas est un environnement de recherche et de pédagogie, non un logiciel de diagnostic. Pour toute publication, valider paramètres, unités, exclusions et résultats sur des jeux de référence.</p></div>
        </>}

        <footer className="footer"><span>NeuroCanvas © 2026 · Open-source scientific toolkit</span>
          <span>{remote ? 'SCIENTIFIC PYTHON ENGINE' : 'LOCAL EDUCATIONAL MODE'} · Data remain on your device</span></footer>
      </div>
    </main>
    {busy && <div className="working" role="status"><RefreshCw className="spin" size={21}/> Traitement en cours…</div>}
    <div className="floating-import" aria-label="Importation des signaux">
      <label className="fs-control">Fs pour CSV sans temps (Hz)<input type="number" min=".01" placeholder="Automatique" value={fsInput} onChange={e=>setFsInput(e.target.value)}/></label>
      <button title="Importer une session JSON" className="outline" onClick={()=>sessionInput.current?.click()}><Save size={15}/> Session</button>
    </div>
  </div>, locale)
}
function Metric({ title, value, sub, icon }: { title: string; value: string; sub: string; icon: ReactNode }) {
  return <div className="metric"><div className="metric-head"><span>{title}</span><span className="metric-icon">{icon}</span></div>
    <strong>{value}</strong><small>{sub}</small></div>
}


function AdvancedResults({ mode, output }: { mode: string; output: Record<string, unknown> }) {
  if (mode === 'quality') {
    const rows = (output.channels || []) as Record<string, string | number | boolean>[]
    return <div><div className="scroll-table"><table><thead><tr><th>Canal</th><th>Type</th><th>Unité</th><th>Moyenne</th><th>RMS</th><th>Amplitude P–P</th></tr></thead>
      <tbody>{rows.map((row,i)=><tr key={i}><td>{String(row.name)}</td><td>{String(row.type)}</td><td>{String(row.unit)}</td>
        <td>{format(Number(row.mean),4)}</td><td>{format(Number(row.rms),4)}</td><td>{format(Number(row.ptp),4)}</td></tr>)}</tbody></table></div>
      <p className="note">{((output.flags || []) as string[]).join(' ')}</p></div>
  }
  if (mode === 'coherence') {
    const d = output as { frequency: number[]; coherence: number[]; first: string; second: string; description: string }
    return <div><Plot title={'Coherence · '+d.first+' / '+d.second} xTitle="Fréquence (Hz)" yTitle="Cohérence magnitude²"
      traces={[{ type:'scatter', mode:'lines', x:d.frequency, y:d.coherence, line:{color:COLORS[0],width:2} }]} />
      <p className="note">{d.description}</p></div>
  }
  if (mode === 'mne-psd') {
    const d = output as { frequency: number[]; channels: string[]; power: number[][]; unit: string; method: string }
    return <Plot title="PSD EEG multicanal · MNE" xTitle="Fréquence (Hz)" yTitle={d.unit}
      traces={d.channels.slice(0,8).map((name,i)=>({ type:'scatter', mode:'lines', x:d.frequency, y:d.power[i],
        name, line:{color:COLORS[i%COLORS.length],width:1.7} }))} height={430}/>
  }
  if (mode === 'mne-epochs') {
    const d = output as { time: number[]; channels: string[]; average: number[][]; n: number; excluded: number; unit: string }
    return <div><p className="result-info">{d.n} époques retenues · {d.excluded} exclues</p>
      <Plot title="MNE · Evoked EEG" xTitle="Temps relatif (s)" yTitle={d.unit}
        traces={d.channels.slice(0,8).map((name,i)=>({type:'scatter',mode:'lines',name,x:d.time,y:d.average[i],
          line:{color:COLORS[i%COLORS.length]}}))} height={420}/></div>
  }
  if (mode === 'montage') {
    const d = output as { channels: { name:string; x:number; y:number }[]; warning:string }
    return <div><Plot title="Positions des électrodes (template standard_1020)" xTitle="Gauche ↔ droite (normalisé)" yTitle="Postérieur ↔ antérieur (normalisé)"
      traces={[{ type:'scatter', mode:'markers+text', x:d.channels.map(x=>x.x), y:d.channels.map(x=>x.y),
        text:d.channels.map(x=>x.name), textposition:'top center', marker:{size:9,color:COLORS[0]} }]} />
      <p className="note">{d.warning}</p></div>
  }
  if (mode === 'ica') {
    const d = output as { component_count:number; explained_variance_ratio:Record<string,number>; warning:string }
    return <div className="summary-list"><div><span>Composantes calculées</span><strong>{d.component_count}</strong></div>
      {Object.entries(d.explained_variance_ratio || {}).map(([key,value])=><div key={key}><span>Variance expliquée · {key}</span><strong>{format(value*100,2)} %</strong></div>)}
      <p className="note">{d.warning}</p></div>
  }
  if (mode === 'hrv') {
    const d = output as { features:Record<string,number|null>; r_peaks:number[]; warning:string }
    return <div><div className="result-info">{d.r_peaks.length} pics R détectés</div>
      <div className="scroll-table"><table><thead><tr><th>Paramètre NeuroKit2</th><th>Valeur</th></tr></thead>
        <tbody>{Object.entries(d.features).map(([name,value])=><tr key={name}><td>{name}</td><td>{value===null?'NA':format(value,5)}</td></tr>)}</tbody></table></div>
      <p className="note">{d.warning}</p></div>
  }
  return <pre className="code-preview">{JSON.stringify(output,null,2)}</pre>
}
