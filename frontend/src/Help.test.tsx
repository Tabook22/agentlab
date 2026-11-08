import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {HelpButton,HelpProvider,UserGuide} from './Help';
import {helpTopics,operationHelp} from './helpContent';
import type {LabEvent} from './events';
import {LocaleProvider} from './i18n';

test('every cycle stage has an explanation and operations resolve to relevant help',()=>{
 for(const stage of ['observe','plan','act','test','adjust','repeat']){
  const key=operationHelp(`agent.${stage}`);
  expect(key).toBe(stage);
  expect(helpTopics[key].body.length).toBeGreaterThan(60);
  expect(helpTopics[key].ar.length).toBeGreaterThan(30);
 }
 for(const [event,topic] of [['research.started','research'],['agent.operation','act'],['agent.review_requested','test'],['master.final_approved','output'],['agent.message_sent','communication'],['task.failed','failure'],['model.retry_scheduled','failure'],['agent.renamed','names'],['mission.cancelled','control']])expect(operationHelp(event)).toBe(topic);
});

test('guide covers purpose, team roles, costs, cycles, approval and the current assignments',()=>{
 const events:LabEvent[]=[{id:'plan',sequence:1,type:'mission.plan_ready',timestamp:'2026-10-29T00:00:00Z',payload:{plan:{count_reason:'Research needs a source specialist.',assignments:[{agent_id:'a',name:'Salim',role:'Researcher',task:'Find five cited news items.',performs:'Research recent sources.'}]}}}];
 const html=renderToStaticMarkup(<HelpProvider><UserGuide events={events}/></HelpProvider>);
 for(const text of ['Why this application exists','What the Master Agent does','Why workers are created','What a cycle means','Cost, requests and open-ended execution','final answer','Salim','Find five cited news items.','Find a topic'])expect(html).toContain(text);
 expect(html).toContain('type="button"');
});

test('help controls have meaningful accessible names and cannot submit mission forms',()=>{
 const html=renderToStaticMarkup(<HelpProvider><HelpButton topic="cycle"/><HelpButton topic="guide" label="User guide"/></HelpProvider>);
 expect(html).toContain('aria-label="Help: What a cycle means"');
 expect(html).toContain('aria-label="User guide"');
 expect(html.match(/type="button"/g)).toHaveLength(2);
});
test('guide topics and contextual help labels are available in Arabic',()=>{
 const html=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><HelpProvider><UserGuide/><HelpButton topic="cycle"/></HelpProvider></LocaleProvider>);
 for(const text of ['لماذا أُنشئ هذا التطبيق؟','ما وظيفة الوكيل الرئيسي؟','ما معنى دورة العمل؟','ابحث في الدليل'])expect(html).toContain(text);
 expect(html).toContain('aria-label="مساعدة: ما معنى دورة العمل؟"');
 expect(html).not.toContain('What a cycle means');
});
