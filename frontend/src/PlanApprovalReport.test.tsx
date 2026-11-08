import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {PlanApprovalReport} from './PlanApprovalReport';
import type {LabEvent} from './events';
const request:LabEvent={id:'plan-1',sequence:2,type:'mission.plan_approval_requested',timestamp:'2026-10-28T00:00:00Z',payload:{worker_plan:{tasks:[{},{}]},estimate:{recommended_total_limit_usd:.3,current_total_limit_usd:.1,server_ceiling_usd:5,estimated_total_low_usd:.1,estimated_total_high_usd:.3,estimated_seconds_low:25,estimated_seconds_high:150,execution_timeout_seconds:240,planning_usage:{estimated_cost_usd:.001},assumptions:{input_tokens_per_call:12000,output_tokens_per_worker:5000,input_usd_per_million:.75,output_usd_per_million:4.5}}}};
it('shows approval, estimated cost and time together before execution',()=>{
 const html=renderToStaticMarkup(<PlanApprovalReport request={request} events={[request]} canApprove onDecision={async()=>{}}/>);
 for(const text of ['no workers have been created or run','Estimated total API cost','Estimated execution time','Planning cost already incurred','Approve this plan and start workers','Decline plan'])expect(html).toContain(text);
 expect(html).toContain('Open-ended · until master approval');
 expect(html).not.toContain('Approved total mission allowance');
 expect(html).toContain('Do you approve these worker names?');
 expect(html).toContain('Keep these names or edit them directly');
 expect(html).not.toContain('type="radio"');
 expect(html).toContain('Approving the plan confirms your chosen names');
 expect(html).toContain('Name for worker 1');
 expect(html).not.toContain('readOnly=""');
 expect(html).toContain('Name for worker 1');
});
it('never offers execution consent again for an already approved report',()=>{
 const html=renderToStaticMarkup(<PlanApprovalReport request={request} events={[{...request,id:'approved',type:'mission.plan_approved',payload:{plan_id:request.id}}]} canApprove/>);
 expect(html).toContain('Plan approved');
 expect(html).not.toContain('Approve this plan and start workers');
});
it('approved name fields use the current identity rather than the original approval names',()=>{
 const saved={...request,payload:{...request.payload,agent_ids:['a','b'],worker_plan:{tasks:[{name:'lumen'},{name:'quill'}]}}};
 const events:LabEvent[]=[saved,{...request,id:'approved',sequence:3,type:'mission.plan_approved',payload:{plan_id:saved.id,worker_names:{a:'lumen',b:'quill'}}},{...request,id:'created',sequence:4,type:'agent.created',agent_id:'a',payload:{config:{name:'lumen'}}},{...request,id:'rename',sequence:5,type:'agent.renamed',agent_id:'a',payload:{name:'Salim',previous_name:'lumen'}}];
 const html=renderToStaticMarkup(<PlanApprovalReport request={saved} events={events} canApprove={false}/>);
 expect(html).toContain('value="Salim"');
 expect(html).not.toContain('value="lumen"');
});
