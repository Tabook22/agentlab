import {agentsFrom,planFrom,type LabEvent} from './events';

export function blueprintFrom(events:LabEvent[]){
 const plan=planFrom(events);
 if(!plan)return null;
 const recorded=events.findLast(e=>e.type==='mission.plan_ready');
 const report=events.findLast(e=>e.type==='mission.plan_approval_requested'&&(!recorded||e.sequence>=recorded.sequence));
 const approved=events.findLast(e=>e.type==='mission.plan_approved'&&e.sequence>(recorded?.sequence??0)&&(!report||e.payload.plan_id===report.id));
 const agents=agentsFrom(events);
 return {plan,recorded,approved,finalApproval:events.findLast(e=>e.type==='master.final_approved'),workers:plan.assignments.map((assignment,index)=>{
   const agent=agents.find(a=>a.id===assignment.agent_id);
   const specIndex=report?.payload.agent_ids?.indexOf(assignment.agent_id)??index;
   const spec=specIndex>=0?report?.payload.worker_plan?.tasks?.[specIndex]:undefined;
   const review=events.findLast(e=>e.type==='master.review_completed'&&e.payload.worker_id===assignment.agent_id);
   const request=events.findLast(e=>e.type==='agent.review_requested'&&e.agent_id===assignment.agent_id);
   const criteria:string[]=Array.isArray(spec?.acceptance_criteria)?spec.acceptance_criteria:review?.payload.data?.checks?.map((c:any)=>c.criterion??c.check).filter(Boolean)??[];
   const tools:string[]=spec?.tools??agent?.config.tools??[];
   return {...assignment,agent,tools,criteria,criteriaSource:spec?.acceptance_criteria?'Planned acceptance criteria':criteria.length?'Recorded review checks':'No criteria recorded yet',
     lifecycle:agent?'Created worker':approved?'Approved role':'Proposed role',
     review,pendingReview:!!request&&(!review||request.sequence>review.sequence),
     accepted:!!review?.payload.approved&&(!request||review.sequence>request.sequence)};
 })};
}
