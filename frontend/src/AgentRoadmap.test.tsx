import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {AgentRoadmap} from './AgentRoadmap';
import {roadmapLessons} from './agentRoadmapContent';
import {LocaleProvider} from './i18n';

test('the roadmap distinguishes model, agent and team and makes all lessons reachable',()=>{
 const html=renderToStaticMarkup(<AgentRoadmap onPractice={()=>{}}/>);
 for(const text of ['Is an LLM an agent?','What is a task?','How do tools work?','What is the agent loop?','What is the harness?','How does the master coordinate agents?','Check your understanding','Illustrative activities · no AI calls'])expect(html).toContain(text);
 expect(html.match(/aria-current="step"/g)).toHaveLength(1);
 expect(html).toContain('disabled=""');
 expect(html).toContain('Sources and terminology');
});
test('Arabic learners receive the roadmap and knowledge checks in Arabic',()=>{
 const html=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><AgentRoadmap onPractice={()=>{}}/></LocaleProvider>);
 for(const text of ['كيف يعمل وكيل الذكاء الاصطناعي؟','ما المهمة؟','ما دورة الوكيل؟','بيئة تشغيل الوكيل','اختبر فهمك','المصادر والمصطلحات'])expect(html).toContain(text);
 expect(html).not.toContain('How does an AI agent actually work?');
});
test('every lesson has a valid knowledge check and accurately bounds the app examples',()=>{
 expect(new Set(roadmapLessons.map(l=>l.id)).size).toBe(8);
 for(const lesson of roadmapLessons){expect(lesson.answers[lesson.correct].en).toBeTruthy();expect(lesson.answers[lesson.correct].ar).toBeTruthy();expect(lesson.feedback.ar).toBeTruthy();}
 expect(roadmapLessons.find(l=>l.id==='tools')!.lab.en).toContain('do not run a shell or deploy');
 expect(roadmapLessons.find(l=>l.id==='team')!.lab.en).toContain('sequentially');
 expect(roadmapLessons.find(l=>l.id==='harness')!.lab.en).toContain('does not impose an app spending cap');
});
