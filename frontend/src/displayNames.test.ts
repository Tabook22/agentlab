import {expect,test} from 'vitest';
import {displayEvents} from './displayNames';
import {agentsFrom,planFrom,type LabEvent} from './events';
const event=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,sequence,type,payload,agent_id,timestamp:'2026-10-29T00:00:00Z'});
const records=()=>[
 event(1,'mission.created',{prompt:'Ask lumen about quills'}),
 event(2,'mission.plan_ready',{plan:{assignments:[{agent_id:'a',name:'lumen',waits_for:[],sends_to:['quill']},{agent_id:'b',name:'quill',waits_for:['lumen'],sends_to:['Master Agent']}],execution_order:'lumen then quill'}}),
 event(3,'mission.plan_approval_requested',{agent_ids:['a','b'],worker_plan:{tasks:[{name:'lumen'},{name:'quill'}]}}),
 event(4,'mission.plan_approved',{worker_names:{a:'lumen',b:'quill'}}),
 event(5,'agent.created',{config:{name:'lumen',instructions:'Send results to quill.'},state:'RUNNING'},'a'),
 event(6,'agent.created',{config:{name:'quill',instructions:'Wait for lumen.'}},'b'),
 event(7,'agent.operation',{summary:'lumen: working with quill',data:{content:'lumen sends evidence to quill',url:'https://example.com/lumen',text:'See https://example.com/lumen and lumen.',sender:'a',receiver:'b',count:42}},'a'),
 event(8,'agent.renamed',{previous_name:'lumen',name:'Salim'},'a'),
 event(9,'agent.renamed',{previous_name:'Salim',name:'الباحث أحمد'},'a'),
 event(10,'agent.renamed',{previous_name:'quill',name:'Fatima'},'b'),
];

test('latest names apply across plans, reports, activity, outputs and early replay frames',()=>{
 const events=records();const named=displayEvents(events);
 expect(planFrom(named)?.assignments[0]).toMatchObject({name:'الباحث أحمد',sends_to:['Fatima']});
 expect(named[1].payload.plan.execution_order).toBe('الباحث أحمد then Fatima');
 expect(named[2].payload.worker_plan.tasks.map((t:any)=>t.name)).toEqual(['الباحث أحمد','Fatima']);
 expect(named[3].payload.worker_names).toEqual({a:'الباحث أحمد',b:'Fatima'});
 expect(named[6].payload.summary).toBe('الباحث أحمد: working with Fatima');
 expect(named[6].payload.data.content).toBe('الباحث أحمد sends evidence to Fatima');
 expect(agentsFrom(named.slice(0,7))[0].config).toMatchObject({name:'الباحث أحمد',instructions:'Send results to Fatima.'});
 expect(named.slice(0,7).some(e=>e.type==='agent.renamed')).toBe(false);
});

test('projection preserves raw records, identities, URLs, user input and numeric data',()=>{
 const events=records();const before=JSON.stringify(events);const named=displayEvents(events);
 expect(JSON.stringify(events)).toBe(before);
 expect(named[0].payload.prompt).toBe('Ask lumen about quills');
 expect(named[6].agent_id).toBe('a');
 expect(named[6].payload.data).toMatchObject({url:'https://example.com/lumen',text:'See https://example.com/lumen and الباحث أحمد.',sender:'a',receiver:'b',count:42});
});

test('whole names match literally, supporting Arabic, punctuation and consecutive renames',()=>{
 const events=[event(1,'agent.created',{config:{name:'Ali (QA)'}},'a'),event(2,'agent.operation',{summary:'Ali (QA) meets Alina and خالد.'},'a'),event(3,'agent.created',{config:{name:'خالد'}},'b'),event(4,'agent.renamed',{previous_name:'Ali (QA)',name:'Maya'},'a'),event(5,'agent.renamed',{previous_name:'خالد',name:'سالم'},'b')];
 expect(displayEvents(events)[1].payload.summary).toBe('Maya meets Alina and سالم.');
});

test('an old name reused by another worker does not corrupt identity labels',()=>{
 const events=[event(1,'agent.created',{config:{name:'Nova'}},'a'),event(2,'agent.created',{config:{name:'Quill'}},'b'),event(3,'agent.renamed',{previous_name:'Nova',name:'Salim'},'a'),event(4,'agent.renamed',{previous_name:'Quill',name:'Nova'},'b')];
 expect(agentsFrom(displayEvents(events)).map(a=>a.config.name)).toEqual(['Salim','Nova']);
});
