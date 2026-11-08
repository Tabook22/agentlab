import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {blueprintFrom} from './blueprint';
import {MissionBlueprint} from './MissionBlueprint';
import {displayEvents} from './displayNames';
import type {LabEvent} from './events';
const event=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,sequence,type,payload,agent_id,timestamp:'2026-10-29T00:00:00Z'});
const assignment=(id:string,name:string)=>({agent_id:id,task_id:`t-${id}`,name,role:'Researcher',task:'Gather evidence',why_separate:'Source discovery needs its own tools.',receives:'A scoped research question',performs:'Search public sources',produces:'A cited brief',waits_for:[],sends_to:['Editor']});
const events=[event(1,'mission.created',{prompt:'Find evidence'}),event(2,'mission.plan_ready',{plan:{basis:'openai_mission_plan',count_reason:'Separate research and editing.',scenario_scope:'Answer with source evidence.',success_criteria:'Supported claims.',execution_order:'Research before editing',fewer_agents:'Too much work in one role.',more_agents:'Extra coordination.',assignments:[assignment('a','Lumen'),assignment('b','Quill')]}}),event(3,'mission.plan_approval_requested',{agent_ids:['a','b'],worker_plan:{tasks:[{tools:['web_research'],acceptance_criteria:['Include publication dates']},{tools:['write_text'],acceptance_criteria:['Keep citations']} ]}})];

test('blueprint separates proposed, approved and created identities without leaking future events',()=>{
 expect(blueprintFrom([])).toBe(null);
 expect(blueprintFrom(events)?.workers[0].lifecycle).toBe('Proposed role');
 const approved=[...events,event(4,'mission.plan_approved',{plan_id:'e3'})];
 expect(blueprintFrom(approved)?.workers[0].lifecycle).toBe('Approved role');
 const created=[...approved,event(5,'agent.created',{config:{name:'Lumen',tools:['web_research']}},'a')];
 expect(blueprintFrom(created)?.workers.map(w=>w.lifecycle)).toEqual(['Created worker','Approved role']);
 expect(blueprintFrom(events)?.finalApproval).toBeUndefined();
});

test('criteria and tools come from the worker’s own saved specification',()=>{
 const model=blueprintFrom(events)!;
 expect(model.workers[0]).toMatchObject({tools:['web_research'],criteria:['Include publication dates'],criteriaSource:'Planned acceptance criteria'});
 expect(model.workers[1].criteria).toEqual(['Keep citations']);
 const legacy=blueprintFrom([...events.slice(0,2),event(4,'master.review_completed',{worker_id:'a',approved:true,data:{checks:[{criterion:'Valid output'}]}})])!;
 expect(legacy.workers[0].criteriaSource).toBe('Recorded review checks');
 expect(legacy.workers[1].criteriaSource).toBe('No criteria recorded yet');
});

test('a new draft clears task acceptance and worker checks never imply final approval',()=>{
 const reviewed=[...events,event(4,'master.review_completed',{worker_id:'a',approved:true,data:{checks:[]}}),event(5,'agent.review_requested',{},'a')];
 const model=blueprintFrom(reviewed)!;
 expect(model.workers[0]).toMatchObject({accepted:false,pendingReview:true});
 expect(model.finalApproval).toBeUndefined();
 expect(blueprintFrom([...reviewed,event(6,'master.final_approved')])?.finalApproval?.sequence).toBe(6);
});

test('renaming propagates to the blueprint and its role explanation without changing IDs',()=>{
 const named=displayEvents([...events,event(4,'agent.renamed',{previous_name:'Lumen',name:'الباحث سالم'},'a')]);
 expect(blueprintFrom(named)?.workers[0]).toMatchObject({agent_id:'a',name:'الباحث سالم'});
 const html=renderToStaticMarkup(<MissionBlueprint events={named} onExploreAgent={()=>{}}/>);
 for(const text of ['الباحث سالم','Source discovery needs its own tools.','Proposed role','Master approval required','Why fewer or more workers?','Blueprint perspectives'])expect(html).toContain(text);
 expect(html).not.toContain('Master approval recorded');
});
