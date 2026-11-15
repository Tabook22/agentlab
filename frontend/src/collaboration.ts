import type {LabEvent} from './events';
import {planFrom} from './events';
import {storyActor,storyTransfer} from './historyStory';
import {packetKind} from './classroom';

export function conversationEntries(events:LabEvent[]){
 return events.slice().sort((a,b)=>a.sequence-b.sequence).flatMap(event=>{
  const transfer=storyTransfer(event,events.filter(e=>e.sequence<=event.sequence));
  return transfer?[{event,transfer,kind:packetKind(event)}]:[];
 });
}
export type LoopStage='observe'|'decide'|'act'|'check';
const phases:Record<string,LoopStage>={
 'agent.input_received':'observe','agent.observe':'observe','master.observe':'observe',
 'agent.plan':'decide','master.plan':'decide','master.decision':'decide',
 'agent.operation':'act','agent.act':'act','agent.tool_started':'act','agent.tool_completed':'act','model.call_started':'act','research.started':'act','master.act':'act','master.improved':'act',
 'agent.test':'check','master.test':'check','master.review_completed':'check',
};
// A cycle is a recorded observation, not a timer or an inferred thought process.
export function agentLoop(events:LabEvent[],agentId:string){
 const own=events.filter(e=>storyActor(e)===agentId);
 const observations=own.filter(e=>e.type===(agentId==='master'?'master.observe':'agent.observe'));
 const last=observations.at(-1);
 const input=own.findLast(e=>e.type==='agent.input_received');
 const start=Math.max(last?.sequence??0,input?.sequence??0);
 const current=own.filter(e=>e.sequence>=start);
 const stages=(['observe','decide','act','check'] as LoopStage[]).map(id=>({id,event:current.findLast(e=>phases[e.type]===id)}));
 const latest=current.findLast(e=>phases[e.type]);
 const feedback=events.findLast(e=>e.type==='master.review_completed'&&e.payload.worker_id===agentId&&e.sequence>=start);
 const repeat=current.findLast(e=>['agent.repeat','agent.adjust','master.adjust'].includes(e.type));
 const accepted=current.findLast(e=>e.type==='agent.output_accepted'||e.type==='master.final_approved');
 const submitted=current.findLast(e=>e.type==='agent.review_requested');
 const checked=current.findLast(e=>e.type==='agent.test'||e.type==='master.test');
 const failed=checked?.payload.passed===false;
 const outcome=repeat&&repeat.sequence>(accepted?.sequence??0)?'repeat':feedback&&feedback.sequence>(submitted?.sequence??0)?feedback.payload.approved?'approved':'revision':accepted?'accepted':submitted?'review':failed?'failed':'working';
 return {stages,active:latest?phases[latest.type]:undefined,cycle:last?.payload.cycle,observations:observations.length,repeat,feedback,outcome};
}
export function handoffContract(events:LabEvent[],agentId:string){
 const plan=planFrom(events),assignment=plan?.assignments.find(a=>a.agent_id===agentId);
 return {plan,assignment,criteria:plan?.success_criteria,planEvent:events.findLast(e=>e.type==='mission.plan_ready')};
}
