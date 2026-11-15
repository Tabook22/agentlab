import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {recordedResources,safeResources,type ResourceState} from './resourceGuide';
import {RelatedResources} from './RelatedResources';
import {LocaleProvider} from './i18n';
import {answerPlainText} from './answerPackage';
import type {LabEvent} from './events';
const resource={title:'A useful lecture',url:'https://example.org/lecture',kind:'video' as const,why:'Explains the method.',how_to_use:'Compare the example with the answer.',level:'beginner',access:'unknown'};
const guide:ResourceState={status:'ready',items:[resource],start_here_urls:[resource.url],missing_types:['book'],limitations:['Not independently verified.']};
const e=(sequence:number,type:string,payload:Record<string,any>={}):LabEvent=>({id:`e${sequence}`,sequence,type,payload,timestamp:'2026-11-16T00:00:00Z'});
const events=[e(1,'master.final_approved'),e(2,'mission.completed'),e(3,'answer.resources_started',{resources:{status:'searching',items:[]}}),e(4,'answer.resources_completed',{resources:guide})];
test('resources do not leak from future events during replay',()=>{
 expect(recordedResources(events.slice(0,2)).status).toBe('not_searched');
 expect(recordedResources(events.slice(0,3))).toEqual({status:'searching',items:[],start_here_urls:[]});
 expect(recordedResources(events).items).toHaveLength(1);
});
test('unsafe links duplicates and unknown resource types cannot become cards',()=>{
 const result=safeResources({...guide,items:[resource,resource,{...resource,url:'javascript:alert(1)'},{...resource,url:'https://example.org/other',kind:'unknown' as any}],start_here_urls:[resource.url,'https://absent.example/']});
 expect(result.items).toEqual([resource]);expect(result.start_here_urls).toEqual([resource.url]);
});
test('guide shows purpose level access route missing categories and safe external links',()=>{
 const html=renderToStaticMarkup(<RelatedResources missionId="demo" events={events} historical live available/>);
 for(const label of ['Learn more and put it into practice','Start here','Why it helps','How to use it','Beginner','Access not confirmed','Books','Mark explored','Replay never starts a new search.'])expect(html).toContain(label);
 expect(html).toContain('rel="noopener noreferrer"');expect(html).not.toContain('Search again');
 const ar=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><RelatedResources missionId="demo" events={events} historical live available/></LocaleProvider>);
 expect(ar).toContain('تعلّم أكثر وطبّق ما فهمته');expect(ar).toContain('ابدأ من هنا');
});
test('unapproved and late-approved results do not show a resource guide',()=>{
 expect(renderToStaticMarkup(<RelatedResources missionId="x" events={[e(1,'mission.completed')]} live available/>)).toBe('');
 expect(renderToStaticMarkup(<RelatedResources missionId="x" events={[e(1,'mission.completed'),e(2,'master.final_approved')]} live available/>)).toBe('');
});
test('copied answer retains the original answer and the separate learning supplement',()=>{
 const text=answerPlainText({mission_id:'x',title:'Answer',goal:'Goal',content:'Approved answer.',sources:[],limitations:[],mode:'live',master_approved:true,variant:'answer',resource_content:'Resources for learning: https://example.org/lecture'});
 expect(text).toContain('Approved answer.');expect(text).toContain('Resources for learning: https://example.org/lecture');
});
