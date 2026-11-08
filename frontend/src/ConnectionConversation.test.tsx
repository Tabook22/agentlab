import React from 'react';
import { expect,test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { connectionMessages,ConnectionConversation } from './ConnectionConversation';
import type { LabEvent } from './events';
const event=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,sequence,type,payload,agent_id,timestamp:'2026-10-29T00:00:00Z'});
const events=[event(1,'task.assigned',{summary:'Collect evidence'},'nova'),event(2,'agent.review_requested',{data:{content:'Actual draft text'}},'nova'),event(3,'agent.review_requested',{data:{content:'Unrelated draft'}},'other'),event(4,'master.review_completed',{worker_id:'nova',approved:false,data:{feedback:'Add source dates',checks:[{criterion:'Recent sources',passed:false,evidence:'Dates missing'}]}}),event(5,'agent.message_sent',{sender:'nova',receiver:'other',data:{content:'Worker handoff'}}),event(6,'agent.operation',{summary:'Private to the worker tool'},'nova')];

test('connection history includes both directions and excludes other connections and operations',()=>{
 const messages=connectionMessages(events,'master','nova');
 expect(messages.map(m=>m.event.sequence)).toEqual([1,2,4]);
 expect(messages[1]).toMatchObject({from:'nova',to:'master',data:{content:'Actual draft text'}});
 expect(connectionMessages(events,'nova','master')).toEqual(messages);
 expect(connectionMessages(events,'nova','other').map(m=>m.event.sequence)).toEqual([5]);
 expect(connectionMessages(events.slice(0,2),'master','nova').map(m=>m.event.sequence)).toEqual([1,2]);
});

test('conversation renders recorded content, feedback and evidence with current names',()=>{
 const renamed=[...events,event(7,'agent.created',{config:{name:'Nova',role:'Writer'}},'nova'),event(8,'agent.renamed',{name:'Salim'},'nova')];
 const html=renderToStaticMarkup(<ConnectionConversation events={renamed} source="master" target="nova" onClose={()=>{}}/>);
 for(const text of ['Salim','Actual draft text','Add source dates','Dates missing','Collect evidence','3 exchanges'])expect(html).toContain(text);
 expect(html).not.toContain('Unrelated draft');
 expect(html).not.toContain('Worker handoff');
 expect(html).not.toContain('Private to the worker tool');
});
