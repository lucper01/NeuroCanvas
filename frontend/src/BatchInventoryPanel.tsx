import { useRef,useState } from 'react'
import { Database,Download,FileDown,FileUp,FolderOpen,Search,ShieldCheck } from 'lucide-react'
import { inventoryCSV,inventoryJSON,scanDatasetInventory } from './batchInventory'
import type { InventoryItem } from './batchInventory'
import type { Language } from './localization'

function warningText(warning:string,fr:boolean):string{
  if(!fr)return warning
  const translations:[string,string][]=[
    ['Header-only CSV scan: sampling frequency, row count and total duration not inferred.',
      'Lecture de l’en-tête CSV uniquement : fréquence, nombre de lignes et durée totale non estimés.'],
    ['Discontinuous EDF+/BDF+: elapsed duration is unknown from this header; use MNE for accurate time axes.',
      'EDF+/BDF+ discontinu : durée réelle non déterminable depuis cet en-tête. Utiliser MNE pour les horodatages.'],
    ['Multiple channel rates: explicit resampling needed for browser analysis.',
      'Fréquences différentes entre canaux : rééchantillonnage explicite nécessaire pour analyser dans le navigateur.'],
    ['Trailing bytes not included in stated record count.',
      'Octets supplémentaires après les enregistrements déclarés.'],
    ['Companion file; select the matching .vhdr to inspect BrainVision metadata.',
      'Fichier associé : sélectionner le .vhdr correspondant pour inspecter les métadonnées BrainVision.'],
    ['MNE/bioread or local Python is required to inspect this format.',
      'Ce format nécessite MNE/bioread ou le moteur Python local.'],
    ['Companion EEG binary file missing:', 'Fichier binaire EEG associé manquant :'],
    ['Referenced VMRK event file missing:', 'Fichier de marqueurs VMRK référencé manquant :'],
    ['EEG binary byte length inconsistent with channel count.',
      'Taille du fichier EEG incohérente avec le nombre de canaux.'],
    ['Unsupported BrainVision binary format:', 'Format binaire BrainVision non pris en charge :']
  ]
  for(const [source,target] of translations)if(warning.startsWith(source))
    return target+warning.slice(source.length)
  return warning
}
const states={
  fr:{readable:'Compatible',partial:'À vérifier',python:'Python requis',invalid:'Invalide'},
  en:{readable:'Readable',partial:'Review',python:'Python needed',invalid:'Invalid'}
}
type Props={locale:Language;onOpen:(files:File[])=>void}
function download(text:string,mime:string,name:string){
  const url=URL.createObjectURL(new Blob([text],{type:mime}))
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click()
  setTimeout(()=>URL.revokeObjectURL(url),3000)
}
export default function BatchInventoryPanel({locale,onOpen}:Props){
  const fr=locale==='fr'
  const input=useRef<HTMLInputElement>(null)
  const [selected,setSelected]=useState<File[]>([])
  const [rows,setRows]=useState<InventoryItem[]>([])
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [hideNames,setHideNames]=useState(true)
  const select=async(files:File[])=>{
    setSelected(files);setRows([]);setMessage('')
    if(!files.length)return
    setBusy(true)
    try{
      const inventory=await scanDatasetInventory(files)
      setRows(inventory)
      setMessage(fr?'Inventaire terminé. Aucun signal brut n’a été chargé.':
        'Inventory complete. No raw signal arrays were loaded.')
    }catch(e){setMessage(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  const open=(row:InventoryItem)=>{
    const file=selected[row.index]
    if(!file)return
    if(row.format==='VHDR'){
      const companions=row.companion_files.map(filename=>selected.find(x=>x.name===filename))
        .filter((x):x is File=>!!x)
      onOpen([file,...companions])
    }else onOpen([file])
  }
  const clean=rows.filter(row=>row.status==='readable').length
  const partial=rows.filter(row=>row.status==='partial').length
  const unavailable=rows.length-clean-partial
  return <div className="batch-studio">
    <section className="panel batch-intro">
      <div className="panel-heading"><div>
        <h3><FolderOpen size={19} style={{verticalAlign:'middle',marginRight:8}}/>
          {fr?'Inventaire d’acquisitions':'Recording batch inventory'}</h3>
        <p>{fr?'Examiner les en-têtes de plusieurs fichiers sans moteur Python et sans transfert réseau.':
          'Inspect multiple recording headers offline, with no Python engine or network upload.'}</p>
      </div><span className="neuro-panel-hint">OFFLINE FIRST</span></div>
      <div className="toolbar batch-top-controls">
        <button className="primary" disabled={busy} onClick={()=>input.current?.click()}>
          <FileUp size={16}/>{fr?'Sélectionner plusieurs fichiers':'Choose multiple files'}</button>
        <input type="file" hidden ref={input} multiple
          accept=".edf,.bdf,.vhdr,.vmrk,.eeg,.csv,.tsv,.fif,.set,.acq,.zip"
          onChange={e=>{const files=Array.from(e.target.files||[]);
            e.target.value='';void select(files)}}/>
        <label className="toggle"><input type="checkbox" checked={hideNames}
          onChange={e=>setHideNames(e.target.checked)}/>
          {fr?'Masquer les noms de fichiers dans les exports':'Redact filenames in exports'}</label>
      </div>
      <p className="note">{fr?
        'Pour BrainVision, sélectionner ensemble .vhdr, .eeg et .vmrk. Le lecteur extrait uniquement les métadonnées disponibles dans les en-têtes. Les durées CSV ne sont pas estimées à partir des seuls noms de colonnes.':
        'For BrainVision, select .vhdr, .eeg and .vmrk together. Only header metadata are scanned. CSV duration is not inferred from the column header.'}</p>
      {message&&<p role="status" className="batch-notice">{message}</p>}
      {busy&&<p role="status" className="batch-notice">{fr?'Analyse des en-têtes…':'Reading file headers…'}</p>}
      {rows.length>0&&<div className="qc-matrix-kpis">
        <div><strong>{rows.length}</strong><small>{fr?'Fichiers':'Files'}</small></div>
        <div><strong>{clean}</strong><small>{fr?'En-têtes compatibles':'Compatible headers'}</small></div>
        <div><strong>{partial}</strong><small>{fr?'Vérification requise':'Review needed'}</small></div>
        <div><strong>{unavailable}</strong><small>{fr?'Non inspectables ici':'Unsupported here'}</small></div>
      </div>}
    </section>
    {rows.length>0&&<section className="panel">
      <div className="panel-heading"><div><h3>{fr?'Résultats de l’inventaire':'Inventory results'}</h3>
        <p>{fr?'Une ligne représente un fichier, avec état de lecture explicite.':
          'One row per file, with explicit reader status.'}</p></div>
        <div className="toolbar">
          <button className="outline" onClick={()=>download(inventoryCSV(rows,hideNames),'text/csv;charset=utf-8',
            'neurocanvas_dataset_inventory.csv')}><Download size={14}/>CSV</button>
          <button className="outline" onClick={()=>download(inventoryJSON(rows,hideNames),
            'application/json','neurocanvas_dataset_inventory.json')}>
            <FileDown size={14}/>JSON</button>
        </div>
      </div>
      <div className="scroll-table batch-table"><table>
        <thead><tr><th>#</th><th>{fr?'Fichier':'File'}</th><th>{fr?'Format':'Format'}</th>
          <th>{fr?'Taille':'Size'}</th><th>{fr?'Canaux':'Channels'}</th>
          <th>Fs (Hz)</th><th>{fr?'Durée (s)':'Duration (s)'}</th>
          <th>{fr?'Marqueurs':'Markers'}</th><th>{fr?'État':'Status'}</th><th>{fr?'Ouvrir':'Open'}</th>
        </tr></thead><tbody>{rows.map(row=><tr key={row.index}>
          <td>{row.index+1}</td>
          <td><strong title={row.filename}>{row.filename}</strong>
            {row.warnings.map((w,i)=><small className="batch-warning" key={i}>{warningText(w,fr)}</small>)}</td>
          <td>{row.format}</td>
          <td>{(row.size_bytes/1024/1024).toFixed(2)} MB</td>
          <td>{row.channels??'—'}</td>
          <td>{row.sampling_hz?.toFixed(2)??'—'}</td>
          <td>{row.duration_s?.toFixed(2)??'—'}</td>
          <td>{row.has_event_channel===null?'—':row.has_event_channel?'✓':'—'}</td>
          <td><span className={'batch-state batch-'+row.status}>{states[fr?'fr':'en'][row.status]}</span></td>
          <td><button className="outline"
            disabled={row.status==='invalid'||['VMRK','EEG'].includes(row.format)}
            onClick={()=>open(row)}><Search size={14}/>{fr?'Charger':'Load'}</button></td>
        </tr>)}</tbody></table></div>
      <p className="note"><ShieldCheck size={14} style={{verticalAlign:'middle',marginRight:5}}/>
        {fr?'Les acquisitions d’origine ne sont pas modifiées. « Compatible » signifie seulement que l’en-tête a été reconnu ; il ne garantit pas la qualité des données ni la validité d’une analyse.':
          '"Compatible" only means the header was recognized. Original files remain unchanged. Scientific quality and analysis validity still require independent verification.'}</p>
    </section>}
    {!rows.length&&!busy&&<section className="panel batch-empty">
      <div className="empty-state"><Database size={31}/>
        <h3>{fr?'Contrôle préalable d’un jeu de données':'Pre-analysis dataset screening'}</h3>
        <p>{fr?'Sélectionnez des acquisitions EDF, BDF, BrainVision ou CSV pour obtenir un inventaire exploitable.':
          'Choose EDF, BDF, BrainVision or CSV recordings for a reproducible metadata inventory.'}</p>
      </div>
    </section>}
  </div>
}
