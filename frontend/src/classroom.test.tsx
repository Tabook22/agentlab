import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {classroomPositions,classroomRoute,classroomSnapshot,eventPreview,packetKind} from './classroom';
import {StudentClassroom} from './StudentClassroom';
import {MissionTheater} from './MissionTheater';
import {LocaleProvider} from './i18n';
import type {LabEvent} from './events';
const e=(sequence:number,type:string,payload:Record<string,any>={},agent_id?:string):LabEvent=>({id:`e${sequence}`,sequence,type,payload,agent_id,timestamp:'2026-11-15T00:00:00Z'});
const base=[e(1,'mission.created',{prompt:'Calculate and check the average'}),e(2,'agent.created',{config:{name:'Maya',role:'Analyst',instructions:'Calculate'}},'a'),e(3,'agent.created',{config:{name:'Omar',role:'Reviewer',instructions:'Check'}},'b')];

test('message cards distinguish questions, evidence, ideas and review outcomes',()=>{
 expect(packetKind(e(1,'agent.message_sent',{message_type:'HELP_REQUEST'}))).toBe('Question');
 expect(packetKind(e(1,'agent.message_sent',{message_type:'IDEA',data:{sources:[{}]}}))).toBe('Idea');
 expect(packetKind(e(1,'agent.message_sent',{data:{sources:[{url:'https://example.com'}]}}))).toBe('Evidence');
 expect(packetKind(e(1,'agent.review_requested'))).toBe('Draft');
 expect(packetKind(e(1,'master.review_completed',{approved:false}))).toBe('Feedback');
 expect(packetKind(e(1,'master.review_completed',{approved:true}))).toBe('Approval');
 expect(packetKind(e(1,'mission.plan_declined'))).toBe('Feedback');
 expect(packetKind(e(1,'mission.completed'))).toBe('Result');
});

test('pending calls remain pending and recorded handoffs focus their receiver',()=>{
 const events=[...base,e(4,'agent.message_sent',{sender:'a',receiver:'b',data:{mean:15}},'a'),e(5,'model.call_started',{purpose:'Check the result'},'b')];
 expect(classroomSnapshot(events,4)).toMatchObject({focus:'b',transfer:{source:'a',target:'b'}});
 const waiting=classroomSnapshot(events,5);
 expect(waiting).toMatchObject({focus:'b',transfer:null,action:{en:'Waiting for a tool or model response'}});
 expect(waiting.rows.find(r=>r.agent_id==='b')?.output).toBeUndefined();
});

test('replay does not borrow future outputs, renamed workers or final approval',()=>{
 const events=[...base,e(4,'agent.input_received',{input:{scores:[10,20]},cycle:1},'a'),e(5,'agent.observe',{cycle:1},'a'),e(6,'agent.output_accepted',{output:{mean:15}},'a'),e(7,'agent.renamed',{name:'Future name'},'a'),e(8,'master.final_approved'),e(9,'mission.completed',{source:'master',output:{mean:15}})];
 const before=classroomSnapshot(events,5);
 expect(before.rows.find(r=>r.agent_id==='a')).toMatchObject({name:'Maya',output:undefined});
 expect(before.approved).toBe(false);expect(before.delivered).toBe(false);
 expect(eventPreview(before.rows.find(r=>r.agent_id==='a')?.input)).toBe('10 · 20');
 expect(classroomSnapshot(events,9)).toMatchObject({approved:true,delivered:true});
});

test('every supported worker fits the classroom and packet paths avoid invalid coordinates',()=>{
 const ids=Array.from({length:8},(_,i)=>`worker-${i}`),layout=classroomPositions(ids);
 expect(layout.positions.size).toBe(11);
 for(const id of ids){const p=layout.positions.get(id)!;expect(p.y+75).toBeLessThan(layout.height);expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(1000);expect(classroomRoute(layout.positions.get('master')!,p)).not.toMatch(/NaN|Infinity/);}
});

test('student mode stays readable and keeps exact payloads behind an explicit action',()=>{
 const events=[...base,e(4,'agent.message_sent',{sender:'a',receiver:'b',data:{mean:15,internal_marker:'DETAILS_ONLY'}},'a')];
 const html=renderToStaticMarkup(<StudentClassroom events={events} status="RUNNING" onDetails={()=>{}}/>);
 for(const label of ['Student classroom','Your goal','The team works together','The answer','Follow active agent','Maya','Omar','What is inside this card?','What came in?','Explore details'])expect(html).toContain(label);
 expect(html).not.toContain('DETAILS_ONLY');
 expect(html).not.toContain('Show history steps');
 const arabic=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><StudentClassroom events={events} status="RUNNING" onDetails={()=>{}}/></LocaleProvider>);
 expect(arabic).toContain('تابع الفكرة وهي تتحول إلى إجابة');
});

test('the mission opens on the team map and keeps the classroom available',()=>{
 const html=renderToStaticMarkup(<MissionTheater events={base} status="RUNNING" replay={false} replayPlaying={false} replaySpeed={1} onPauseReplay={()=>{}} onStart={()=>{}} onChooseMission={()=>{}} onShowPlan={()=>{}} canControl={false} onTogglePause={()=>{}}/>);
 expect(html.match(/<button[^>]*aria-pressed="true"[^>]*>(.*?)<\/button>/s)?.[1]).toContain('Mission map');expect(html).toContain('Student classroom');expect(html).toContain('Agent workbenches');
 expect(html).not.toContain('aria-label="Team workspace"');
 expect(html).toContain('class="theater-now"');
});
