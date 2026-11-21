import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {PlanConversation} from './PlanConversation';
import {LocaleProvider} from './i18n';
import type {LabEvent} from './events';

const task=(name:string,dependencies:number[])=>({name,role:'Specialist',title:`Prepare ${name}`,instructions:`Check the ${name} evidence.`,input_description:'The supplied question.',expected_output:`${name} brief`,acceptance_criteria:['Cite the supplied evidence.'],dependencies});
const request:LabEvent={id:'proposal',sequence:4,type:'mission.plan_approval_requested',timestamp:'2026-11-21',payload:{report:{requested_objective:'Compare two designs'},worker_plan:{scope:'Compare feasibility before selecting a design.',count_reason:'Two independent reviews feed one final comparison.',success_criteria:'A supported comparison.',tasks:[task('Research',[]),task('Costs',[]),task('Compare',[0,1])]}}};
test('public proposal shows real dependency handoffs and acceptance checks before consent',()=>{
 const html=renderToStaticMarkup(<PlanConversation request={request} events={[request]}/>);
 for(const text of ['Compare two designs','Compare feasibility','3 proposed workers','Research + Costs','Master Agent for assembly and review','Cite the supplied evidence.','only after you approve this version'])expect(html).toContain(text);
 expect(html.match(/Your approval; no worker dependency/g)).toHaveLength(2);
 expect(html.match(/<dd>Compare<\/dd>/g)).toHaveLength(2);
});
test('review includes user feedback and Arabic controls without changing saved instructions',()=>{
 const revision={...request,id:'change',sequence:3,type:'mission.plan_revision_requested',payload:{instruction:'Remove the quiz.'}};
 const html=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><PlanConversation request={request} events={[revision,request]}/></LocaleProvider>);
 expect(html).toContain('Remove the quiz.');expect(html).toContain('هذه طريقتي المقترحة');expect(html).toContain('Check the Research evidence.');
});
