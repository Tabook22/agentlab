import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MissionClarification,pendingClarification} from './MissionClarification';
import {journeyNextAction} from './MissionJourney';
import {theaterStory} from './theater';
import {workAnimation} from './animation';
import type {LabEvent} from './events';
import {recordedMissionStatus} from './events';
const event=(sequence:number,type:string,payload:Record<string,any>={}):LabEvent=>({id:`e${sequence}`,sequence,type,payload,timestamp:'2026-11-01T00:00:00Z'});
const question=event(1,'mission.clarification_requested',{question:'Who will use this report?',understanding:'You need a report comparing three options.'});
test('pre-delegation questions have a direct answer form and explicit planning authorization',()=>{
 const html=renderToStaticMarkup(<MissionClarification events={[question]} status="AWAITING_CLARIFICATION" canAnswer onAnswer={async()=>{}}/>);
 for(const text of ['Who will use this report?','What I understand so far','Send answer &amp; continue planning','another paid AI planning request','have not created or assigned any workers'])expect(html).toContain(text);
 expect(html).toContain('<textarea');
 const readonly=renderToStaticMarkup(<MissionClarification events={[question]} status="AWAITING_CLARIFICATION"/>);
 expect(readonly).not.toContain('<textarea');expect(readonly).toContain('read-only');
 const cancelled=renderToStaticMarkup(<MissionClarification events={[question]} status="CANCELLED" canAnswer onAnswer={async()=>{}}/>);
 expect(cancelled).not.toContain('<textarea');
});
test('clarification answers close only their own question and remain visible after understanding',()=>{
 const answer=event(2,'mission.clarification_answered',{question_id:question.id,question:question.payload.question,answer:'First-year students.'});
 expect(pendingClarification([question,answer])).toBeUndefined();
 const next=event(3,'mission.clarification_requested',{question:'How long should it be?'});
 expect(pendingClarification([question,answer,next])).toEqual(next);
 const html=renderToStaticMarkup(<MissionClarification events={[question,answer,event(4,'master.mission_understood',{understanding:'A concise comparison for first-year students.'})]} status="AWAITING_APPROVAL"/>);
 expect(html).toContain('Mission understood');expect(html).toContain('First-year students.');expect(html).not.toContain('<textarea');
});
test('waiting clarification is a user turn, not ongoing work or a failure',()=>{
 expect(journeyNextAction('AWAITING_CLARIFICATION',false,false,false)).toBe('clarify');
 expect(theaterStory([question],'AWAITING_CLARIFICATION').title).toBe('The master has a question for you');
 expect(workAnimation([question],'AWAITING_CLARIFICATION',true,true,false,false).enabled).toBe(false);
});
test('persisted clarification state wins over a stale running snapshot on refresh',()=>{
 expect(recordedMissionStatus([question],'RUNNING')).toBe('AWAITING_CLARIFICATION');
 const answer=event(2,'mission.clarification_answered',{question_id:question.id});
 expect(recordedMissionStatus([question,answer],'AWAITING_CLARIFICATION')).toBe('RUNNING');
 expect(recordedMissionStatus([question,answer,event(3,'mission.plan_approval_requested')],'RUNNING')).toBe('AWAITING_APPROVAL');
});
