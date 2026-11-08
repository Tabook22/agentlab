import { HelpButton } from './Help';
import {useState} from 'react';
import {Pencil,Check,X} from 'lucide-react';
import {Translate} from './i18n';
import {normalizeWorkerName,workerNamesError} from './workerNames';
import './workerNames.css';

export function WorkerNameEditor({name,onSave}:{name:string;onSave:(name:string)=>Promise<void>}){
 const [editing,setEditing]=useState(false),[value,setValue]=useState(name),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){
  const invalid=workerNamesError([value]);if(invalid){setError(invalid);return;}
  setBusy(true);setError('');
  try{await onSave(normalizeWorkerName(value));setEditing(false);}catch(cause){setError(cause instanceof Error?cause.message:'Could not save the worker name. Please try again.');}finally{setBusy(false);}
 }
 return <Translate><div className="worker-name-editor"><HelpButton topic="names"/>{editing?<><label>Worker name<input aria-label="New worker name" dir="auto" value={value} onChange={e=>setValue(e.target.value)} maxLength={60} disabled={busy} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!busy)void save();}if(e.key==='Escape'&&!busy)setEditing(false);}}/></label><div><button type="button" onClick={()=>void save()} disabled={busy||!value.trim()}><Check size={13}/>{busy?'Saving…':'Save name'}</button><button type="button" onClick={()=>setEditing(false)} disabled={busy}><X size={13}/>Cancel</button></div>{error&&<p role="alert">{error}</p>}</>:<button type="button" onClick={()=>{setValue(name);setError('');setEditing(true);}}><Pencil size={12}/>Change name</button>}</div></Translate>;
}
