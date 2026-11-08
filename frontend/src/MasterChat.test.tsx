import React from 'react';
import {test,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MasterChat,chatDecisions} from './MasterChat';
import type {LabEvent} from './events';
const event=(sequence:number,type:string):LabEvent=>({id:String(sequence),sequence,type,timestamp:'2026-10-29',payload:{summary:'Recorded decision'}});
test('discussion selector uses actual mission decisions and excludes chat',()=>{
 expect(chatDecisions([event(1,'mission.plan_approval_requested'),event(2,'master.chat.message'),event(3,'master.review_completed'),event(4,'master.final_approved'),event(5,'agent.observe')]).map(e=>e.sequence)).toEqual([1,3,4]);
});
test('study has a labeled question, decision lens, separate costs and approval explanation',()=>{
 const html=renderToStaticMarkup(<MasterChat missionId="mission" events={[event(1,'mission.plan_ready')]} status="AWAITING_APPROVAL" available onClose={()=>{}}/>);
 for(const text of ['The Master’s study','Your question to the master','The whole mission','Approval stays with you','Discussion does not approve or change','Paid AI discussion','separate from mission execution'])expect(html).toContain(text);
 expect(html).toContain('id="master-question"');expect(html).toContain('role="log"');expect(html).not.toContain('Approve plan');
});
test('missing key is explained before sending',()=>{
 const html=renderToStaticMarkup(<MasterChat missionId="mission" events={[]} status="FAILED" available={false} onClose={()=>{}}/>);
 expect(html).toContain('A saved backend OpenAI API key is needed');
});
