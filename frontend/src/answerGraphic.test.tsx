import React from 'react';
import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {LabEvent} from './events';
import {approvedAnswerGraphic,answerGraphicSvg,plainGraphicText} from './answerGraphic';
import {AnswerInfographic} from './AnswerInfographic';
import {LocaleProvider} from './i18n';
const e=(sequence:number,type:string,payload:Record<string,any>={}):LabEvent=>({id:`e${sequence}`,sequence,type,payload,timestamp:'2026-11-16T01:00:00Z'});
const approved=(output:Record<string,any>)=>[e(1,'mission.created',{prompt:'Explain a practical plan'}),e(2,'master.final_approved'),e(3,'mission.completed',{source:'master',output})];
test('visual answer requires both final approval and delivered output in the displayed timeline',()=>{
 const events=approved({content:'## Plan\nDo the work.'});
 expect(approvedAnswerGraphic(events.slice(0,2))).toBeNull();
 expect(approvedAnswerGraphic([events[0],events[2]])).toBeNull();
 expect(approvedAnswerGraphic([events[0],events[2],e(4,'master.final_approved')])).toBeNull();
 expect(approvedAnswerGraphic(events)?.sequence).toBe(3);
 expect(renderToStaticMarkup(<AnswerInfographic events={events.slice(0,2)}/>)).toBe('');
});
test('heading hierarchy keeps all sections, nested details and explicit limitations',()=>{
 const content='# Heritage plan\nOverview paragraph.\n\n## Gather data\nRecord consent.\n### Metadata\nKeep model_name.\n\n## Train the model\nUse a small pilot.\n\n## Evaluate\nCheck with experts.';
 const model=approvedAnswerGraphic(approved({title:'Heritage plan',content,limitations:['Consent still required.'],sources:[{title:'Study',url:'https://example.org/study'},{title:'Unsafe',url:'javascript:alert(1)'}]}))!;
 expect(model.steps.map(s=>s.title)).toEqual(['Heritage plan','Gather data','Train the model','Evaluate']);
 expect(model.steps[1].content).toContain('### Metadata');expect(model.steps[1].excerpt).toContain('model_name');
 expect(model.steps[1].topic).toBe('data');expect(model.steps[2].topic).toBe('build');expect(model.steps[3].topic).toBe('review');
 expect(model.limitations).toEqual(['Consent still required.']);expect(model.sources).toHaveLength(1);
});
test('numbered answers preserve continuations and do not turn code into invented instructions',()=>{
 const model=approvedAnswerGraphic(approved({content:'1. Collect sources\n   Keep their dates.\n\n2. Compare figures\n   Check units.'}))!;
 expect(model.steps).toHaveLength(2);expect(model.steps[0].content).toContain('Keep their dates.');
 const code=approvedAnswerGraphic(approved({content:'```\n1. literal code\n2. still code\n```'}))!;
 expect(code.steps).toHaveLength(1);expect(code.steps[0].title).toBe('Key idea 1');
 expect(plainGraphicText('**Keep** `model_name` and __values__.')).toBe('Keep model_name and values.');
});
test('zero and negative numerical results are visible without claiming future work occurred',()=>{
 const model=approvedAnswerGraphic(approved({scores:[-1,1],mean:0,sum:0,count:2,result:0}))!;
 expect(model.metrics.find(m=>m.label==='Average')?.value).toBe('0');
 expect(model.steps.some(s=>s.content.includes('-1'))).toBe(true);
 expect(model.steps.some(s=>s.content.includes('Average: 0'))).toBe(true);
});
test('download preserves every section beyond the initial six and safely escapes markup',()=>{
 const content=Array.from({length:11},(_,i)=>`## Part ${i+1}\nExact detail ${i+1} & <unsafe> "quoted".`).join('\n\n');
 const model=approvedAnswerGraphic(approved({title:'<script>bad</script>',content,limitations:['Do not omit me.']}))!;
 expect(model.steps).toHaveLength(11);
 const drawing=answerGraphicSvg(model);
 expect(drawing.svg).toContain('Exact detail 11 &amp; &lt;unsafe&gt;');expect(drawing.svg).toContain('Do not omit me.');
 expect(drawing.svg).not.toContain('<script>');expect(drawing.svg).not.toContain('<foreignObject');expect(drawing.height).toBeGreaterThan(1000);
 const html=renderToStaticMarkup(<AnswerInfographic events={approved({title:'Plan',content})}/>);
 expect(html).toContain('Show all 11 parts');expect(html).toContain('answer-visual-reading');expect(html).not.toContain('class="answer-reading"');
});
test('Arabic labels and SVG direction are available without translating source evidence',()=>{
 const events=approved({title:'خطة تعليمية',content:'## جمع البيانات\nسجّل المصادر.\n\n## تقييم النتائج\nراجع مع خبير.'});
 const model=approvedAnswerGraphic(events,true)!;
 expect(model.steps[0].topic).toBe('data');expect(model.steps[1].topic).toBe('review');
 expect(answerGraphicSvg(model,true).svg).toContain('direction="rtl"');
 const html=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><AnswerInfographic events={events}/></LocaleProvider>);
 expect(html).toContain('إجابتك، خطوة بخطوة في صورة');expect(html).toContain('سجّل المصادر.');
});
