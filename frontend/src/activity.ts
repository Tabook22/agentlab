import { agentsFrom, planFrom, workFor, type LabEvent } from './events';

export const lifecycleStages = [
  {type:'agent.created',label:'Created'}, {type:'task.assigned',label:'Assigned'},
  {type:'agent.input_received',label:'Input'}, {type:'agent.decision',label:'Why this action'},
  {type:'agent.operation',label:'Process'}, {type:'agent.tool_completed',label:'Output'},
  {type:'agent.message_sent',label:'Delivered'},
];

export function activityNames(events:LabEvent[]) {
  const names=new Map<string,string>([['master','Master Agent']]);
  for(const assignment of planFrom(events)?.assignments ?? []) names.set(assignment.agent_id,assignment.name);
  for(const agent of agentsFrom(events)) names.set(agent.id,agent.config.name);
  return names;
}

export function actorLabel(event:LabEvent,names:Map<string,string>) {
  if(event.type==='agent.message_sent') return `${names.get(event.payload.sender) || 'Sender'} → ${names.get(event.payload.receiver) || 'Receiver'}`;
  const name=names.get(event.agent_id || '') || 'Worker';
  if(['agent.created','task.created','task.assigned'].includes(event.type)) return `Master → ${name}`;
  if(event.type.startsWith('master.') || event.type.startsWith('mission.')) return 'Master Agent';
  return event.agent_id?name:'Master Agent';
}

export function agentActivity(events:LabEvent[],id:string) {
  const own=events.filter(e=>e.agent_id===id);
  const trace=workFor(events,id);
  const inputSequence=trace.attemptStart;
  const decision=own.findLast(e=>e.type==='agent.decision'&&e.sequence>=inputSequence);
  const stages=lifecycleStages.map(stage=>({...stage,
    occurred:stage.type==='agent.message_sent'?(events.some(e=>e.type===stage.type&&e.payload.sender===id)||
      (events.findLast(e=>e.type==='mission.completed')?.payload.source_agent_ids?.includes(id) ?? (events.some(e=>e.type==='mission.completed')&&events.findLast(e=>e.type==='task.completed')?.agent_id===id))):own.some(e=>e.type===stage.type),
  }));
  return {trace,decision,stages,created:own.find(e=>e.type==='agent.created'),assignment:own.findLast(e=>e.type==='task.assigned')};
}

export function matchesActor(event:LabEvent,filter:string):boolean {
  if(filter==='all') return true;
  if(filter==='master') return event.type.startsWith('master.')||event.type.startsWith('mission.')||['agent.created','task.created','task.assigned'].includes(event.type);
  return event.agent_id===filter||event.payload.sender===filter||event.payload.receiver===filter||event.payload.target_agent_id===filter;
}

export function matchesActivityQuery(event:LabEvent,query:string,names:Map<string,string>):boolean {
  return `${event.type} ${event.payload.summary || ''} ${event.payload.action || ''} ${event.payload.operation || ''} ${actorLabel(event,names)}`.toLowerCase().includes(query.trim().toLowerCase());
}
