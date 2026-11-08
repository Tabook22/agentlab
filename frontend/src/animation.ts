import type { LabEvent } from './events';
import {agentsFrom} from './events';
import {missionProgress} from './monitor';

export function workAnimation(events:LabEvent[],status:string,replay:boolean,playing:boolean,paused:boolean,reduced:boolean){
  const lastStop=events.findLast(e=>['mission.completed','mission.failed','mission.cancelled','mission.cancel','mission.planning','mission.retry_requested','mission.execution_opened','mission.plan_approved','mission.limit_approval_requested','mission.clarification_requested'].includes(e.type));
  const stopped=lastStop&&['mission.completed','mission.failed','mission.cancelled','mission.cancel','mission.limit_approval_requested','mission.clarification_requested'].includes(lastStop.type);
  const enabled=playing&&!paused&&!reduced&&!stopped&&(replay||['CREATED','RUNNING'].includes(status));
  const workers=enabled?agentsFrom(events).filter(a=>a.state==='RUNNING').map(a=>a.id):[];
  const pending=missionProgress(events).pending;
  const commander=!!enabled&&(!pending?.agent_id&&pending?.type==='model.call_started'||!workers.length&&events.some(e=>e.type==='mission.planning')&&!events.some(e=>e.type==='task.assigned'));
  return {enabled:!!enabled,workers,commander};
}

export type Point = { x:number; y:number };
export type Transfer = { source:string; target:string; label:string; data:Record<string,any>; sequence:number; id:string };

export function transferFor(event:LabEvent|undefined, prefix:LabEvent[]):Transfer|null {
  if (!event) return null;
  const base = {id:event.id,sequence:event.sequence};
  if (event.type === 'task.assigned' && event.agent_id) return {...base,source:'master',target:event.agent_id,label:'Task assignment',data:{task:event.payload.summary}};
  if (event.type === 'agent.review_requested' && event.agent_id) return {...base,source:event.agent_id,target:'master',label:'Draft submitted for master review',data:event.payload.data??{}};
  if (event.type === 'master.review_completed' && event.payload.worker_id) return {...base,source:'master',target:event.payload.worker_id,label:event.payload.approved?'Master task approval':'Master revision feedback',data:event.payload.data??{}};
  if (event.type === 'agent.message_sent' && event.payload.sender && event.payload.receiver) return {...base,source:event.payload.sender,target:event.payload.receiver,label:({HELP_REQUEST:'Question for the master',IDEA:'Proposed approach',GUIDANCE:'Commander guidance'} as Record<string,string>)[event.payload.message_type]??'Result handoff',data:event.payload.data ?? {}};
  if (event.type === 'mission.completed') {
    if(event.payload.source==='master') return {...base,source:'master',target:'result',label:'Combined mission answer',data:event.payload.output ?? {}};
    const last = prefix.findLast(e=>e.type==='task.completed' && e.agent_id);
    if (last?.agent_id) return {...base,source:last.agent_id,target:'result',label:'Final output',data:event.payload.output ?? {}};
  }
  return null;
}

export function visibleTransfers(events:LabEvent[]):Transfer[] {
  const edges = new Map<string,Transfer>();
  events.forEach((event,index)=>{
    const transfer = transferFor(event,events.slice(0,index+1));
    if (transfer) edges.set(`${transfer.source}:${transfer.target}`,transfer);
  });
  return [...edges.values()];
}

export function stationPositions(ids:string[]):Map<string,Point> {
  const rows=Math.max(1,Math.ceil(ids.length/3));
  const positions = new Map<string,Point>([['master',{x:500,y:90}],['result',{x:500,y:565+(rows-1)*270}]]);
  ids.forEach((id,i)=>{
    const row = Math.floor(i/3);
    const rowCount = Math.min(3,ids.length-row*3);
    positions.set(id,{x:(i%3+0.5)*1000/rowCount,y:360+row*270});
  });
  return positions;
}

export function packetPath(from:Point,to:Point):string {
  const bend = from.y===to.y?from.y-165:(from.y+to.y)/2;
  return `M ${from.x} ${from.y} Q ${(from.x+to.x)/2} ${bend} ${to.x} ${to.y}`;
}

// Apply unremarkable state events with the next visible action, without inventing any.
export function nextVisualCursor(events:LabEvent[],cursor:number):number {
  const visible = new Set(['master.decision','agent.decision','mission.plan_ready','agent.created','task.assigned','agent.input_received','agent.operation','agent.message_sent','agent.review_requested','master.review_completed','master.improved','master.final_approved','task.completed','task.failed','task.retry_requested','mission.completed','mission.failed','mission.cancel']);
  for(let i=cursor;i<events.length;i++) if(visible.has(events[i].type)) return i+1;
  return events.length;
}

export function dataCaption(data:Record<string,any>):string {
  if(data.error) return data.error;
  if(data.result!==undefined) return `Calculated result: ${data.result}`;
  if(typeof data.content==='string') return `${data.label || 'Text artifact'} · ${data.content.length} characters${data.accepted?' · accepted':''}`;
  if (data.mean !== undefined) return `Average ${data.mean} · ${data.scores?.length ?? data.count ?? '?'} scores${data.verified?' · verified':''}`;
  if (Array.isArray(data.scores)) return `${data.scores.length} scores: ${data.scores.join(', ')}`;
  if (Array.isArray(data.temperatures)) return `${data.temperatures.length} synthetic weather observations`;
  if (data.task) return data.task;
  if (data.lesson) return 'A curated explanation of AI agents';
  return 'Structured task data';
}
