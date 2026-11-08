import {useEffect,useState} from 'react';
import {History,Play,Pencil,Trash2,RotateCcw,Search} from 'lucide-react';
import {Translate,formatDateTime,useLanguage} from './i18n';

type MissionRecord={id:string;prompt:string;scenario:string;mode:string;status:string;created_at:string;history?:{title:string;notes:string;deleted:boolean}};
export function MissionHistory({request,onReplay,onPrepare}:{request:(path:string,options?:RequestInit)=>Promise<any>;onReplay:(mission:MissionRecord)=>void;onPrepare:(mission:MissionRecord)=>void}){
 const {language}=useLanguage();
 const [items,setItems]=useState<MissionRecord[]>([]),[trashed,setTrashed]=useState(false),[search,setSearch]=useState(''),[status,setStatus]=useState('all');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [editing,setEditing]=useState<string|null>(null),[title,setTitle]=useState(''),[notes,setNotes]=useState('');
 useEffect(()=>{let current=true;setLoading(true);setError('');setEditing(null);request(`/missions?trashed=${trashed}`).then(rows=>{if(current)setItems(rows);}).catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[trashed,request]);
 async function mutate(item:MissionRecord,action:'save'|'delete'|'restore'){
  setBusy(true);setError('');setNotice('');
  try{
   const updated=await request(`/missions/${item.id}${action==='restore'?'/restore':''}`,{method:action==='save'?'PATCH':action==='delete'?'DELETE':'POST',...(action==='save'?{headers:{'Content-Type':'application/json'},body:JSON.stringify({title,notes})}:{})});
   setItems(rows=>action==='save'?rows.map(row=>row.id===item.id?updated:row):rows.filter(row=>row.id!==item.id));setEditing(null);
   setNotice(action==='save'?'Mission details saved.':action==='delete'?'Mission moved to Trash. You can restore it from the Trash tab.':'Mission restored.');
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 const filtered=items.filter(item=>(status==='all'||item.status===status)&&[item.prompt,item.history?.title,item.history?.notes].some(value=>value?.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
 return <Translate><section className="mission-history"><div className="eyebrow">PERSISTED IN YOUR LOCAL DATABASE</div><h1>Every mission leaves a trail.</h1><p className="muted">Replay, rename, annotate, or prepare an edited mission for a new run. Deleted missions can be restored from Trash.</p>
 <div className="history-toolbar"><div className="history-tabs" role="group" aria-label="History folders"><button disabled={busy} aria-pressed={!trashed} onClick={()=>{setTrashed(false);setNotice('');}}>Saved missions</button><button disabled={busy} aria-pressed={trashed} onClick={()=>{setTrashed(true);setNotice('');}}><Trash2 size={15}/>Trash</button></div><label><Search size={16}/><span className="sr-only">Search missions</span><input aria-label="Search missions" placeholder="Search titles, missions, or notes…" value={search} onChange={e=>setSearch(e.target.value)}/></label><label><span>Status</span><select aria-label="Filter mission history by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{['CREATED','RUNNING','PAUSED','AWAITING_CLARIFICATION','AWAITING_APPROVAL','AWAITING_LIMIT_APPROVAL','COMPLETED','FAILED','CANCELLED'].map(value=><option key={value} value={value}>{value.toLowerCase()}</option>)}</select></label></div>
 {error&&<p role="alert" className="history-error">{error}</p>}{notice&&<p role="status" className="history-notice">{notice}</p>}
 <p className="muted history-count">{filtered.length} missions</p>
 {loading?<p role="status">Loading missions…</p>:<div className="history-list">{filtered.length?filtered.map(item=>{
  const active=!['COMPLETED','FAILED','CANCELLED'].includes(item.status);
  return <article className="panel history-card" key={item.id}><div className="history-summary"><span className="example-icon blue"><History size={20}/></span><div><h2>{item.history?.title||item.prompt}</h2><small>{formatDateTime(item.created_at,language)} · {item.scenario} · {item.status.toLowerCase()}</small>{item.history?.title&&<p className="history-original">{item.prompt}</p>}{item.history?.notes&&<p className="history-notes">{item.history.notes}</p>}</div></div>
  {editing===item.id?<form className="history-editor" onSubmit={e=>{e.preventDefault();void mutate(item,'save');}}><h3>Edit mission details</h3><label>Mission title<input aria-label="Mission title" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={200}/></label><label>Admin notes<textarea aria-label="Admin notes" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000} rows={3}/></label><p>These details organize your history. The original mission, actions, and results remain in the execution record.</p><div className="history-actions"><button type="submit" disabled={busy||!title.trim()}>Save changes</button><button type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel editing</button></div></form>:<div className="history-actions">{trashed?<button disabled={busy} onClick={()=>void mutate(item,'restore')}><RotateCcw size={15}/>Restore mission</button>:<><button disabled={busy} onClick={()=>onReplay(item)}><Play size={15}/>View activity</button><button disabled={busy||active} onClick={()=>{setEditing(item.id);setTitle((item.history?.title||item.prompt).slice(0,200));setNotes(item.history?.notes||'');setNotice('');}}><Pencil size={15}/>Edit details</button><button disabled={busy||active} onClick={()=>onPrepare(item)}><Pencil size={15}/>Edit & run again</button><button className="history-delete" disabled={busy||active} onClick={()=>void mutate(item,'delete')}><Trash2 size={15}/>Delete mission</button></>}</div>}
  {active&&<p className="muted history-active-note">Finish or cancel this mission before editing or deleting its history.</p>}
 </article>;
 }):<p>{trashed?'Trash is empty.':'No missions match your search.'}</p>}</div>}
 </section></Translate>;
}
