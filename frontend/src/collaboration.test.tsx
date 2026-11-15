import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {agentLoop,conversationEntries,handoffContract} from './collaboration';
import {LearningLab} from './LearningLab';
import type {LabEvent} from './events';
import {LocaleProvider} from './i18n';
const e=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,sequence,type,payload,agent_id,timestamp:'2026-11-16T00:00:00Z'});
const worker=e(1,'agent.created',{config:{name:'Maya',role:'Researcher',instructions:'Find dated sources'}},'a');
test('team board preserves real routing, structured data and review outcomes without invented chat',()=>{
 const events=[worker,e(2,'agent.observe',{},'a'),e(3,'agent.message_sent',{sender:'a',receiver:'master',message_type:'HELP_REQUEST',data:{question:'Which year?'}},'a'),e(4,'master.review_completed',{worker_id:'a',approved:false,data:{feedback:'Check the dates'}})];
 const board=conversationEntries(events);
 expect(board).toHaveLength(2);
 expect(board[0]).toMatchObject({kind:'Question',transfer:{source:'a',target:'master',data:{question:'Which year?'}}});
 expect(board[1]).toMatchObject({kind:'Feedback',transfer:{source:'master',target:'a'}});
 expect(conversationEntries(events.slice(0,2))).toEqual([]);
});
test('a new observation cycle never inherits checks or acceptance from an earlier attempt',()=>{
 const events=[worker,e(2,'agent.observe',{cycle:1},'a'),e(3,'agent.test',{passed:true},'a'),e(4,'agent.output_accepted',{},'a'),e(5,'agent.observe',{cycle:2},'a'),e(6,'agent.plan',{public_plan:['Check newer sources']},'a')];
 const loop=agentLoop(events,'a');
 expect(loop).toMatchObject({cycle:2,active:'decide',observations:2,outcome:'working'});
 expect(loop.stages.find(s=>s.id==='check')?.event).toBeUndefined();
 expect(agentLoop(events.slice(0,4),'a').outcome).toBe('accepted');
});
test('revisions, submission and checks distinguish retry requested from passed checks',()=>{
 const events=[worker,e(2,'agent.observe',{cycle:1},'a'),e(3,'agent.test',{passed:false},'a')];
 expect(agentLoop(events,'a').outcome).toBe('failed');
 events.push(e(4,'agent.test',{passed:true},'a'));
 expect(agentLoop(events,'a').outcome).toBe('working');
 events.push(e(5,'agent.review_requested',{},'a'),e(6,'master.review_completed',{worker_id:'a',approved:false}));
 expect(agentLoop(events,'a').outcome).toBe('revision');
 events.push(e(7,'agent.repeat',{next_cycle:2},'a'));
 expect(agentLoop(events,'a').outcome).toBe('repeat');
 expect(agentLoop(events,'master').active).toBe('check');
});
test('task contracts use only the plan available at the selected historical point',()=>{
 const events=[worker,e(2,'mission.plan_ready',{plan:{success_criteria:'Both dates must match',assignments:[{agent_id:'a',name:'Maya',task:'Find sources',receives:'Topic',produces:'Dated figures',waits_for:[],sends_to:['Analyst']} ]}})];
 expect(handoffContract(events,'a')).toMatchObject({criteria:'Both dates must match',assignment:{produces:'Dated figures'}});
 expect(handoffContract(events.slice(0,1),'a').assignment).toBeUndefined();
 expect(handoffContract(events,'unknown').assignment).toBeUndefined();
});
test('learning board renders accessible tools, explanation and real content in both languages',()=>{
 const events=[worker,e(2,'agent.message_sent',{sender:'a',receiver:'master',message_type:'HELP_REQUEST',data:{question:'Which year?'}},'a')];
 const props={events,agentId:'a',sequence:2,motion:false,onSelect:()=>{},onAgent:()=>{},onDetails:()=>{}};
 const html=renderToStaticMarkup(<LearningLab {...props}/>);
 for(const text of ['Team conversation','Agent loop','Task handoff lab','Which year?','Why this message?','Open recorded contents','Follow on map','role="tabpanel"'])expect(html).toContain(text);
 const ar=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><LearningLab {...props}/></LocaleProvider>);
 expect(ar).toContain('حوار الفريق');expect(ar).toContain('دورة الوكيل');expect(ar).toContain('مختبر تسليم المهام');
});
