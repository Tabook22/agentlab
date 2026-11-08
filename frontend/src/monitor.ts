import {agentsFrom,planFrom,type LabEvent} from './events';

export function missionProgress(events:LabEvent[]){
 const agents=agentsFrom(events),plan=planFrom(events);
 const tasks=new Set(events.filter(e=>e.type==='task.created'&&e.task_id).map(e=>e.task_id));
 const completed=new Set(events.filter(e=>e.type==='task.completed'&&e.task_id).map(e=>e.task_id));
 const boundary=events.findLast(e=>['mission.failed','mission.completed','mission.cancelled','mission.cancel','mission.limit_approval_requested','mission.clarification_requested'].includes(e.type))?.sequence||0;
 const pending=events.findLast(start=>start.sequence>boundary&&['model.call_started','research.started','agent.tool_started'].includes(start.type)&&!events.some(end=>end.sequence>start.sequence&&end.agent_id===start.agent_id&&(
  start.type==='model.call_started'?end.type==='model.call_completed'&&end.payload.purpose===start.payload.purpose:
  start.type==='research.started'?end.type==='research.completed':end.type==='agent.tool_completed')));
 const last=events.at(-1);
 const actorId=pending?.agent_id||last?.agent_id;
 return {agents,plan,last,pending,actor:actorId?agents.find(agent=>agent.id===actorId)?.config.name||'Worker':'Commander',
  total:plan?.assignments.length||tasks.size,completed:completed.size,
  handoffs:events.filter(e=>e.type==='agent.message_sent').length,
  verified:events.some(e=>e.type==='master.test'&&e.payload.scope==='whole mission'&&e.payload.passed),
  finished:events.some(e=>e.type==='mission.completed')};
}
