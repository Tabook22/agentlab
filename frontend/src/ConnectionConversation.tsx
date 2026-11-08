import { useEffect, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { agentsFrom, planFrom, type LabEvent } from './events';
import { transferFor } from './animation';
import { HelpButton } from './Help';
import { operationHelp } from './helpContent';
import { DataPreview } from './WorkView';
import './conversation.css';

export function connectionMessages(events:LabEvent[],source:string,target:string) {
  return events.flatMap(event=>{
    const transfer=transferFor(event,events);
    const from=transfer?.source??event.payload.sender;
    const to=transfer?.target??event.payload.receiver;
    if(!((from===source&&to===target)||(from===target&&to===source)))return [];
    return [{event,from,to,label:transfer?.label??event.type.replaceAll('.',' ').replaceAll('_',' '),data:transfer?.data??event.payload.data??{}}];
  });
}

export function ConnectionConversation({events,source,target,onClose}:{events:LabEvent[];source:string;target:string;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [limit,setLimit]=useState(25);
  const [query,setQuery]=useState('');
  useEffect(()=>{const node=dialog.current;node?.showModal();return ()=>node?.close();},[]);
  const names=new Map([['master','Master Agent'],['result','Mission result'],...(planFrom(events)?.assignments??[]).map(a=>[a.agent_id,a.name] as [string,string]),...agentsFrom(events).map(a=>[a.id,a.config.name] as [string,string])]);
  const name=(id:string)=>names.get(id)??id;
  const messages=connectionMessages(events,source,target);
  const filtered=messages.filter(m=>JSON.stringify([m.label,m.event.payload]).toLowerCase().includes(query.toLowerCase()));
  const latest=messages.at(-1);
  return <dialog ref={dialog} className="connection-conversation" aria-label="Connection conversation" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <header><MessageSquare size={23}/><div><h2>Connection conversation</h2><p><bdi translate="no">{name(source)}</bdi> ↔ <bdi translate="no">{name(target)}</bdi></p></div><button onClick={onClose} aria-label="Close conversation" autoFocus><X size={21}/></button></header>
    <div className="conversation-intro"><p>Recorded exchanges on this connection. New messages appear as they arrive; reading does not pause the mission.</p><strong>{messages.length} exchanges</strong>{latest?.event.type==='agent.review_requested'&&<p>Latest exchange: draft submitted, awaiting the master's response.</p>}<label>Find in conversation<input value={query} onChange={e=>{setQuery(e.target.value);setLimit(25);}} placeholder="Search assignments, drafts or feedback"/></label></div>
    <div className="conversation-messages"><small>Newest first · showing {Math.min(limit,filtered.length)} of {filtered.length}</small>{!filtered.length&&<p>{messages.length?'No exchanges match your search.':'No messages have been recorded on this connection yet. Activity packets indicate ongoing work.'}</p>}{filtered.slice(-limit).reverse().map(({event,from,to,label,data})=><article key={event.id} className={from==='master'?'message-from-master':'message-from-worker'}>
      <div className="conversation-message-meta"><strong><bdi translate="no">{name(from)}</bdi> → <bdi translate="no">{name(to)}</bdi></strong><span>#{event.sequence} · <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString()}</time>{event.payload.cycle?` · Cycle ${event.payload.cycle}`:''}</span></div>
      <h3>{label}<HelpButton topic={operationHelp(event.type)} detail={event.payload.summary}/></h3>{event.payload.summary&&![data.task,data.assigned_task,data.mission,data.request,data.lesson,data.content].includes(event.payload.summary)&&<p>{event.payload.summary}</p>}{data.feedback&&data.feedback!==event.payload.summary&&<p>{data.feedback}</p>}
      <DataPreview data={data}/>
      {Array.isArray(data.checks)&&<ul>{data.checks.filter((c:any)=>c.evidence).map((c:any,i:number)=><li key={i}>{c.criterion??c.check}: {c.evidence}</li>)}</ul>}
      <details><summary>Full recorded exchange</summary><pre>{JSON.stringify(event.payload,null,2)}</pre></details>
    </article>)}{filtered.length>limit&&<button className="conversation-older" onClick={()=>setLimit(n=>n+25)}>Show older exchanges</button>}</div>
  </dialog>;
}
