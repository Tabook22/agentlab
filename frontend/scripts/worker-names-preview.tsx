// Interactive fixture for checking the real approval component without API calls.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LocaleProvider} from '../src/i18n';
import {PlanApprovalReport} from '../src/PlanApprovalReport';
import type {LabEvent} from '../src/events';
import '../src/style.css';
import '../src/plan.css';
const request:LabEvent={id:'preview-plan',sequence:1,type:'mission.plan_approval_requested',timestamp:'2026-10-28T00:00:00Z',payload:{agent_ids:['researcher','editor'],worker_plan:{tasks:[{name:'Lumen',role:'Researcher',title:'Collect source-backed findings'},{name:'Quill',role:'Editor',title:'Review and organize the findings'}]},estimate:{recommended_total_limit_usd:.3,current_total_limit_usd:.1,server_ceiling_usd:5,estimated_total_low_usd:.1,estimated_total_high_usd:.3,estimated_seconds_low:25,estimated_seconds_high:150,execution_timeout_seconds:240,planning_usage:{estimated_cost_usd:.001},assumptions:{input_tokens_per_call:12000,output_tokens_per_worker:5000,input_usd_per_million:.75,output_usd_per_million:4.5}}}};
function Preview(){
 const [events,setEvents]=useState<LabEvent[]>([]);
 return <div style={{maxWidth:1000,margin:'30px auto',padding:24}}><p>INTERFACE TEST · No API requests or workers are started.</p><PlanApprovalReport request={request} events={events} canApprove onDecision={async(action,planId,cap,names)=>{setEvents([{id:'decision',sequence:2,timestamp:request.timestamp,type:action==='approve'?'mission.plan_approved':'mission.plan_declined',payload:{plan_id:planId,total_budget_usd:cap,worker_names:names}}]);}}/></div>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider initialLanguage="en"><Preview/></LocaleProvider>);
