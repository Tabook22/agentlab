import {agentsFrom, planFrom, type LabEvent} from './events';

export type ExchangeKind = 'Question' | 'Idea' | 'Feedback' | 'Decision' | 'Handoff';
export function workspaceExchanges(events:LabEvent[]) {
  return events.flatMap(event=>{
    const p=event.payload;
    let kind:ExchangeKind, from=String(p.sender??event.agent_id??'master'), to=String(p.receiver??'master');
    if(event.type==='agent.message_sent') kind=p.message_type==='HELP_REQUEST'?'Question':p.message_type==='GUIDANCE'?'Feedback':p.message_type==='IDEA'?'Idea':'Handoff';
    else if(event.type==='agent.review_requested') kind='Handoff';
    else if(event.type==='master.review_completed'){kind=p.approved?'Decision':'Feedback';from='master';to=p.worker_id;}
    else if(event.type==='agent.decision'||event.type==='master.decision'){kind='Decision';to='team';}
    else if(event.type==='workspace.question_answered'){kind='Feedback';from='you';to=event.agent_id??'master';}
    else return [];
    return [{event,kind,from,to,text:String(p.data?.question??p.data?.feedback??p.summary??'Recorded exchange')}];
  });
}

export function openQuestions(events:LabEvent[]) {
  return events.filter(e=>e.type==='agent.message_sent'&&e.payload.message_type==='HELP_REQUEST'&&!events.some(answer=>answer.type==='workspace.question_answered'&&answer.payload.question_id===e.id||answer.type==='task.completed'&&answer.agent_id===e.agent_id&&answer.sequence>e.sequence));
}

export function workspaceAgents(events:LabEvent[]) {
  const agents=agentsFrom(events), plan=planFrom(events);
  return (plan?.assignments??agents.map(a=>({agent_id:a.id,name:a.config.name,role:a.config.role,task:a.config.instructions,waits_for:[]}))).map(row=>{
    const own=events.filter(e=>e.agent_id===row.agent_id);
    const attempt=own.findLast(e=>e.type==='agent.observe');
    const start=attempt?.sequence??0;
    const latest=(type:string)=>own.findLast(e=>e.type===type&&e.sequence>=start);
    const draft=own.findLast(e=>['agent.tool_completed','agent.output_accepted'].includes(e.type)&&e.sequence>=start);
    const review=events.findLast(e=>e.type==='master.review_completed'&&e.payload.worker_id===row.agent_id&&e.sequence>=start);
    const question=openQuestions(events).findLast(e=>e.agent_id===row.agent_id);
    const last=own.at(-1), agent=agents.find(a=>a.id===row.agent_id);
    const accepted=!!review?.payload.approved&&(!draft||review.sequence>draft.sequence||draft.type==='agent.output_accepted');
    const status=question?'Needs your answer':accepted?'Task accepted':review&&!review.payload.approved?'Revision requested':draft?'Draft ready':agent?.state==='RUNNING'?'Working':['FAILED','CANCELLED','TERMINATED'].includes(agent?.state??'')?'Stopped':row.waits_for.length?'Waiting for input':'Ready';
    return {...row,agent,last,question,status,accepted,observe:attempt,plan:latest('agent.plan'),act:latest('agent.act'),test:latest('agent.test'),draft,review};
  });
}

const moments=new Set(['mission.clarification_requested','mission.clarification_answered','master.mission_understood','mission.plan_ready','task.assigned','agent.plan','agent.message_sent','agent.review_requested','master.review_completed','master.improved','master.final_approved','mission.completed','mission.failed','workspace.question_answered']);
export const keyMoments=(events:LabEvent[])=>events.filter(e=>moments.has(e.type));

export function sharedResult(events:LabEvent[]) {
  const result=events.findLast(e=>['master.improved','mission.completed'].includes(e.type)&&e.payload.output);
  const approved=events.some(e=>e.type==='master.final_approved'&&(!result||e.sequence>result.sequence||result.type==='mission.completed'));
  return {event:result,output:result?.payload.output as Record<string,any>|undefined,approved};
}
