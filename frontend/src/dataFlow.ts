import {agentsFrom,planFrom,type LabEvent} from './events';
import {transferFor} from './animation';

export function dataFlow(events:LabEvent[]) {
 const workers=planFrom(events)?.assignments??agentsFrom(events).map(a=>({agent_id:a.id,name:a.config.name,role:a.config.role,task:a.config.instructions}));
 const transfers=events.flatMap((event,i)=>{
  const transfer=transferFor(event,event.type==='mission.completed'?events.slice(0,i+1):[]);
  return transfer?[{...transfer,label:event.payload.message_type==='HELP_REQUEST'&&transfer.target!=='master'?'Clarification question':transfer.label,event,revision:event.type==='master.review_completed'&&event.payload.approved===false}]:[];
 });
 // Include recorded participants even if an older plan omits them. A message is
 // evidence of participation, not evidence of a parent/child agent hierarchy.
 const roster=new Map(workers.map(w=>[w.agent_id,w]));
 for(const a of agentsFrom(events))if(!roster.has(a.id))roster.set(a.id,{agent_id:a.id,name:a.config.name,role:a.config.role,task:a.config.instructions});
 for(const t of transfers)for(const id of [t.source,t.target])if(!['master','result'].includes(id)&&!roster.has(id))roster.set(id,{agent_id:id,name:id,role:'Recorded participant',task:''});
 const rows=[{agent_id:'master',name:'Master Agent',role:'Coordinate · review · approve',task:''},...roster.values()].map(w=>{
  const master=w.agent_id==='master';
  const own=events.filter(e=>master?e.type.startsWith('master.'):e.agent_id===w.agent_id);
  const observation=own.findLast(e=>e.type==='agent.observe');
  const received=own.findLast(e=>e.type==='agent.input_received');
  const sameAttempt=received&&observation&&(received.sequence===observation.sequence-1||received.payload.cycle!==undefined&&received.payload.cycle===observation.payload.cycle);
  const start=master?0:sameAttempt?Math.min(received.sequence,observation.sequence):Math.max(received?.sequence??0,observation?.sequence??0);
  const current=own.filter(e=>e.sequence>=start);
  const incoming=transfers.filter(t=>t.target===w.agent_id),outgoing=transfers.filter(t=>t.source===w.agent_id);
  const input=master?incoming.at(-1)?.event??events.find(e=>e.type==='mission.created'):current.findLast(e=>e.type==='agent.input_received')??current.findLast(e=>e.type==='agent.observe');
  const process=current.filter(e=>['agent.plan','agent.operation','agent.act','agent.test','master.plan','master.decision','master.act','master.test','master.improved','master.review_completed'].includes(e.type));
  const masterOutput=events.findLast(e=>['mission.plan_ready','master.improved','master.final_approved'].includes(e.type)||outgoing.at(-1)?.sequence===e.sequence);
  const output=master?masterOutput:current.findLast(e=>['agent.tool_completed','agent.output_accepted','agent.act'].includes(e.type));
  const inputSources:string[]=input?.payload.source_agents??(input?incoming.filter(t=>t.sequence<=input.sequence).slice(-1).map(t=>t.source):[]);
  const review=events.findLast(e=>e.type==='master.review_completed'&&e.payload.worker_id===w.agent_id&&e.sequence>=start);
  const submission=current.findLast(e=>e.type==='agent.review_requested');
  const accepted=!!review?.payload.approved&&(!submission||review.sequence>submission.sequence);
  return {...w,input,process,output,incoming,outgoing,inputSources,accepted,cycle:master?undefined:current.findLast(e=>e.payload.cycle)?.payload.cycle};
 });
 return {rows,transfers};
}

export function flowPayload(event:LabEvent) {
 const p=event.payload;
 return p.input??p.world??p.output??p.artifact??p.data??p.value??p;
}
