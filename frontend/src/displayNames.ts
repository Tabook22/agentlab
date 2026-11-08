import type { LabEvent } from './events';

// Project saved records for display. Identity keys and durable records stay intact.
export function displayEvents(events:LabEvent[]):LabEvent[] {
  const names=new Map<string,string>();
  const renamed=new Map<string,string>();
  const owners=new Map<string,Set<string>>();
  function remember(id:unknown,name:unknown,current=true){
    if(typeof id!=='string'||typeof name!=='string'||!name)return;
    const key=name.toLocaleLowerCase();
    const ids=owners.get(key)??new Set<string>();ids.add(id);owners.set(key,ids);
    if(current)names.set(id,name);
  }
  for(const e of events){
    for(const row of e.payload.plan?.assignments??[])remember(row.agent_id,row.name);
    const ids=e.payload.agent_ids??[];
    (e.payload.worker_plan?.tasks??[]).forEach((row:any,i:number)=>remember(ids[i],row.name));
    for(const [id,name] of Object.entries(e.payload.worker_names??{}))remember(id,name);
    if(e.type==='agent.created')remember(e.agent_id,e.payload.config?.name);
    if(e.type==='agent.renamed'){
      remember(e.agent_id,e.payload.previous_name,false);
      remember(e.agent_id,e.payload.name);
      if(e.agent_id&&typeof e.payload.name==='string')renamed.set(e.agent_id,e.payload.name);
    }
  }
  for(const [id,name] of renamed)names.set(id,name);
  const replacements=new Map<string,string>();
  for(const [alias,ids] of owners){
    if(ids.size!==1)continue; // Ambiguous historical names cannot identify a worker.
    const current=names.get([...ids][0]);
    if(current)replacements.set(alias,current);
  }
  if(![...replacements].some(([old,name])=>old!==name))return events;
  const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp(`(?<![\\p{L}\\p{N}_])(${[...replacements.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|')})(?![\\p{L}\\p{N}_])`,'giu');
  function text(value:string){
    // Names inside source URLs are data, not display-name references.
    return value.split(/(https?:\/\/[^\s<>"']+)/g).map(part=>/^https?:\/\//.test(part)?part:part.replace(pattern,match=>replacements.get(match.toLocaleLowerCase())??match)).join('');
  }
  const identityKeys=new Set(['id','agent_id','agent_ids','worker_id','task_id','task_ids','mission_id','sender','receiver','dependencies','depends_on','url','href','model','tool','tools','type','prompt','requested_objective']);
  function project(value:any,key=''):any {
    if(identityKeys.has(key))return value;
    if(typeof value==='string')return text(value);
    if(Array.isArray(value))return value.map(item=>project(item,key));
    if(!value||typeof value!=='object')return value;
    const result=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,project(v,k)]));
    if(typeof value.agent_id==='string'&&names.has(value.agent_id)&&typeof value.name==='string')result.name=names.get(value.agent_id);
    return result;
  }
  return events.map(e=>{
    const payload=project(e.payload);
    if(e.type==='agent.created'&&e.agent_id&&names.has(e.agent_id))payload.config={...payload.config,name:names.get(e.agent_id)};
    if(e.type==='agent.renamed'&&e.agent_id&&names.has(e.agent_id))payload.name=names.get(e.agent_id);
    if(e.payload.worker_names)payload.worker_names=Object.fromEntries(Object.entries(e.payload.worker_names).map(([id,name])=>[id,names.get(id)??name]));
    if(e.payload.worker_plan&&e.payload.agent_ids)payload.worker_plan={...payload.worker_plan,tasks:payload.worker_plan.tasks.map((task:any,i:number)=>({...task,name:names.get(e.payload.agent_ids[i])??task.name}))};
    return {...e,payload};
  });
}
