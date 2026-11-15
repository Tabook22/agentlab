import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {HistoryStory,MissionHistorySteps} from './MissionHistorySteps';
import {chapterFor,historyIllustration,storyMoments,storySnapshot,storyTransfer} from './historyStory';
import type {LabEvent} from './events';
const e=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,mission_id:'demo',sequence,type,payload,agent_id,timestamp:'2026-11-14T00:00:00Z'});
const events=[e(1,'mission.created',{prompt:'Explain the topic'}),e(2,'mission.plan_approval_requested',{summary:'Review the team'}),e(3,'mission.plan_approved',{summary:'Permission given'}),e(4,'agent.created',{config:{name:'Maya',role:'Researcher',instructions:'Find sources'}},'a'),e(5,'agent.input_received',{input:{mission:'Explain the topic'},cycle:1},'a'),e(6,'agent.observe',{cycle:1},'a'),e(7,'agent.plan',{summary:'Find evidence',public_plan:['Find evidence']},'a'),e(8,'agent.review_requested',{data:{content:'Draft'}},'a'),e(9,'master.review_completed',{worker_id:'a',approved:false,data:{feedback:'Add a source'}}),e(10,'agent.message_sent',{sender:'a',receiver:'master',message_type:'HELP_REQUEST',data:{question:'Which audience?'}},'a'),e(11,'workspace.question_answered',{question_id:'e10',instruction:'College students'},'a'),e(12,'master.final_approved',{summary:'Final approval recorded'}),e(13,'mission.completed',{source:'master',output:{content:'Final answer'}})];

test('history includes actual human permission, clarification and revision directions',()=>{
 expect(storyTransfer(events[1],events)).toMatchObject({source:'master',target:'you'});
 expect(storyTransfer(events[2],events)).toMatchObject({source:'you',target:'master',label:'Permission granted'});
 expect(storyTransfer(events[8],events)).toMatchObject({source:'master',target:'a',label:'Master revision feedback'});
 expect(storyTransfer(events[10],events)).toMatchObject({source:'you',target:'a'});
 expect(chapterFor(e(14,'mission.budget_approved'))).toBe('permission');
 expect(chapterFor(e(14,'agent.operation'))).toBe('work');
 expect(storyMoments([...events,e(14,'model.call_started')])).toHaveLength(13);
});

test('historical snapshots never borrow later approval, output or input',()=>{
 const before=storySnapshot(events,4);
 expect(before).toMatchObject({approved:false,delivered:false});
 expect(before.rows.find(r=>r.agent_id==='a')).toMatchObject({input:undefined,output:undefined});
 const revision=storySnapshot(events,9);
 expect(revision.transfer).toMatchObject({source:'master',target:'a'});
 expect(revision.rows.find(r=>r.agent_id==='a')?.accepted).toBe(false);
 expect(storySnapshot(events,13)).toMatchObject({approved:true,delivered:true});
 expect(storySnapshot(events.filter(e=>e.type!=='master.final_approved'),13).approved).toBe(false);
 const legacy=[...events.slice(0,7),e(8,'agent.output_accepted',{output:{content:'Accepted task'}},'a')];
 expect(storySnapshot(legacy,8).rows.find(r=>r.agent_id==='a')?.accepted).toBe(true);
 expect(storySnapshot(legacy,8).approved).toBe(false);
});

test('the finished answer exposes a history button while unfinished missions do not',()=>{
 expect(renderToStaticMarkup(<MissionHistorySteps events={events.slice(0,8)}/>)).toBe('');
 expect(renderToStaticMarkup(<MissionHistorySteps events={events}/>)).toContain('Show history steps');
 const html=renderToStaticMarkup(<HistoryStory events={events} onClose={()=>{}}/>);
 for(const label of ['Mission story chapters','Play history','History step','Agent communication drawing','Maya','Input','Processing','Output','Every step in recorded order','Save illustration','Final answer'])expect(html).toContain(label);
 expect(html).toContain('Not recorded');
});

test('illustration escapes arbitrary mission text and preserves chronology through review loops',()=>{
 const attack=e(1,'mission.created',{prompt:'<script>alert("hello")</script> & students'});
 const svg=historyIllustration([attack,...events.slice(1)]);
 expect(svg).toContain('&lt;script&gt;');expect(svg).not.toContain('<script>');
 expect(svg.indexOf('#8 ')).toBeLessThan(svg.indexOf('#9 '));
 expect(svg.indexOf('#9 ')).toBeLessThan(svg.indexOf('#10 '));
 expect(svg).toContain('Master Agent → Maya');
});
