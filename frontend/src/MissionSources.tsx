import { apiBase } from './apiBase';
import {useState} from 'react';
import {FileText,Paperclip} from 'lucide-react';
import {useLanguage} from './i18n';
import type {LabEvent} from './events';
import type {MissionAttachment} from './attachments';
import './attachments.css';
export function MissionSources({events}:{events:LabEvent[]}){
 const {language}=useLanguage(),ar=language==='ar';const [loaded,setLoaded]=useState<Record<string,MissionAttachment>>({}),[error,setError]=useState('');
 const files:MissionAttachment[]=events.find(e=>e.type==='mission.created')?.payload.attachments??[];
 if(!files.length)return null;
 async function load(id:string){if(loaded[id])return;try{const response=await fetch(`${apiBase}/attachments/${id}`);const body=await response.json();if(!response.ok)throw Error(body.detail||'Source unavailable.');setLoaded(old=>({...old,[id]:body}));}catch(cause){setError(cause instanceof Error?cause.message:'Source unavailable.');}}
 return <details className="mission-saved-sources"><summary><Paperclip size={15}/>{files.length} {ar?'مصادر محفوظة مع هذه المهمة':'sources saved with this mission'}</summary>{files.map(file=><details key={file.id} onToggle={e=>{if(e.currentTarget.open)void load(file.id);}}><summary><FileText size={14}/><span dir="auto">{file.filename}</span><small>{file.character_count.toLocaleString()} {ar?'حرف':'characters'}</small></summary><a href={`${apiBase}/attachments/${file.id}/original`} download>{ar?'تنزيل الملف الأصلي':'Download original file'}</a>{loaded[file.id]?<><pre dir="auto">{loaded[file.id].text}</pre>{loaded[file.id].notices.map(note=><p dir="auto" key={note}>{note}</p>)}</>:<p>{ar?'جارٍ تحميل المصدر…':'Loading source…'}</p>}</details>)}{error&&<p role="alert">{error}</p>}</details>;
}
