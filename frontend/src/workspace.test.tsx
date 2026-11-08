import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AgentWorkspace} from './AgentWorkspace';
import {workspaceAgents,workspaceExchanges,openQuestions,sharedResult,keyMoments} from './workspace';
import type {LabEvent} from './events';
const e=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,sequence,type,payload,agent_id,mission_id:'mission',timestamp:'2026-10-31T00:00:00Z'});
const base=[e(1,'mission.created',{mode:'live'}),e(2,'agent.created',{config:{name:'Maya',role:'Researcher',instructions:'Compare methods'}},'a')];
test('workbenches distinguish drafts, accepted tasks and new revision attempts',()=>{
 const events=[...base,e(3,'agent.observe',{cycle:1},'a'),e(4,'agent.tool_completed',{output:{content:'Draft'}},'a')];
 expect(workspaceAgents(events)[0].status).toBe('Draft ready');
 events.push(e(5,'master.review_completed',{worker_id:'a',approved:true}));
 expect(workspaceAgents(events)[0].accepted).toBe(true);
 events.push(e(6,'agent.observe',{cycle:2},'a'));
 expect(workspaceAgents(events)[0]).toMatchObject({accepted:false,draft:undefined});
});
test('questions remain open until an answer is explicitly linked to that question',()=>{
 const q=e(3,'agent.message_sent',{message_type:'HELP_REQUEST',summary:'Which audience?',sender:'a',receiver:'master'},'a');
 expect(openQuestions([...base,q,e(4,'commander.instruction',{instruction:'Be clear'},'a')])).toEqual([q]);
 expect(openQuestions([...base,q,e(4,'workspace.question_answered',{question_id:q.id},'a')])).toEqual([]);
 expect(workspaceExchanges([q])[0]).toMatchObject({kind:'Question',from:'a',to:'master',text:'Which audience?'});
 expect(workspaceExchanges([e(4,'agent.message_sent',{message_type:'GUIDANCE',sender:'master',receiver:'a'})])[0].kind).toBe('Feedback');
});
test('team completion does not imply recorded final approval',()=>{
 const events=[e(1,'master.improved',{output:{content:'First draft'}}),e(2,'mission.completed',{output:{content:'Delivered'}})];
 expect(sharedResult(events)).toMatchObject({approved:false,output:{content:'Delivered'}});
 expect(sharedResult([...events,e(3,'master.final_approved')]).approved).toBe(true);
 expect(sharedResult([e(1,'master.final_approved'),e(2,'master.improved',{output:{content:'Later draft'}})]).approved).toBe(false);
});
test('workspace renders recorded contributions and makes replay questions read-only',()=>{
 const events=[...base,e(3,'agent.tool_completed',{output:{label:'Methods table',content:'Actual contribution'}},'a'),e(4,'agent.message_sent',{message_type:'HELP_REQUEST',summary:'Which audience?',sender:'a',receiver:'master'},'a')];
 const html=renderToStaticMarkup(<AgentWorkspace events={events} status="FAILED" replay={false} onInspect={()=>{}}/>);
 for(const label of ['Agents working','Shared result','Questions &amp; decisions','Maya','Methods table','Needs your answer','Save answer','Replay key moments'])expect(html).toContain(label);
 const replay=renderToStaticMarkup(<AgentWorkspace events={events} status="FAILED" replay onInspect={()=>{}}/>);
 expect(replay).not.toContain('<textarea');expect(replay).toContain('read-only');
 expect(keyMoments([...events,e(5,'model.call_started')]).map(e=>e.sequence)).toEqual([4]);
});
