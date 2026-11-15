import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {dataFlow,flowPayload} from './dataFlow';
import {AgentDataFlow} from './AgentDataFlow';
import {keyMoments} from './workspace';
import type {LabEvent} from './events';
const e=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,sequence,type,payload,agent_id,timestamp:'2026-11-14T00:00:00Z'});
const base=[e(1,'mission.created',{prompt:'Find the average'}),e(2,'agent.created',{config:{name:'Maya',role:'Calculator',instructions:'Calculate'}},'a')];

test('each attempt keeps its input alongside observation and clears stale work after a revision',()=>{
 const events=[...base,e(3,'agent.input_received',{input:{scores:[10,20]},cycle:1},'a'),e(4,'agent.observe',{world:{cycle:1},cycle:1},'a'),e(5,'agent.operation',{value:{mean:15}},'a'),e(6,'agent.tool_completed',{output:{mean:15}},'a'),e(7,'agent.review_requested',{data:{mean:15}},'a'),e(8,'master.review_completed',{worker_id:'a',approved:false,data:{feedback:'Show the calculation'}})];
 const first=dataFlow(events);
 expect(flowPayload(first.rows[1].input!)).toEqual({scores:[10,20]});
 expect(first.transfers.map(t=>[t.source,t.target,t.revision])).toEqual([['a','master',false],['master','a',true]]);
 expect(first.rows[1].accepted).toBe(false);
 events.push(e(9,'agent.input_received',{input:{previous_attempt:{mean:15}},cycle:2},'a'),e(10,'agent.observe',{cycle:2},'a'));
 const second=dataFlow(events).rows[1];
 expect(second).toMatchObject({cycle:2,process:[],output:undefined});
 expect(second.input?.sequence).toBe(9);
 expect(dataFlow(events.filter(e=>e.sequence<=6)).transfers).toEqual([]);
});

test('input provenance follows the received dependency data, and simulation acceptance can precede tool completion',()=>{
 const events=[...base,e(3,'agent.input_received',{source_agents:['upstream'],input:{mean:15}},'a'),e(4,'agent.observe',{cycle:1},'a'),e(5,'agent.review_requested',{data:{mean:15}},'a'),e(6,'master.review_completed',{worker_id:'a',approved:true}),e(7,'agent.tool_completed',{output:{mean:15}},'a'),e(8,'task.completed',{},'a')];
 expect(dataFlow(events).rows[1]).toMatchObject({inputSources:['upstream'],accepted:true});
});

test('handoffs preserve all messages and all participants including workers absent from the plan',()=>{
 const events=[...base,e(3,'agent.created',{config:{name:'Omar',role:'Reviewer'}},'b'),e(4,'agent.message_sent',{sender:'a',receiver:'b',data:{mean:15}}),e(5,'agent.message_sent',{sender:'b',receiver:'a',message_type:'HELP_REQUEST',data:{question:'Which scores?'}}),e(6,'agent.message_sent',{sender:'a',receiver:'b',data:{scores:[10,20]}})];
 const flow=dataFlow(events);
 expect(flow.rows.map(r=>r.agent_id)).toEqual(['master','a','b']);
 expect(flow.transfers.map(t=>t.sequence)).toEqual([4,5,6]);
 expect(flow.transfers[0].data).toEqual({mean:15});
 expect(flow.transfers[1].label).toBe('Clarification question');
 const html=renderToStaticMarkup(<AgentDataFlow events={events}/>);
 for(const text of ['Input','Processing','Output','Maya','Omar','Read transferred data','Recorded transfers'])expect(html).toContain(text);
});

test('step-through includes the input, operation, draft and check rather than skipping to handoffs',()=>{
 const events=['agent.input_received','agent.observe','agent.plan','agent.operation','agent.act','agent.test','agent.tool_completed','agent.output_accepted'].map((type,i)=>e(i+1,type,{},'a'));
 expect(keyMoments(events)).toEqual(events);
});
