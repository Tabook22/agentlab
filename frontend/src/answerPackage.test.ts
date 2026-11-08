import {expect,test} from 'vitest';
import {answerPlainText,reusablePrompt,type AnswerPackage} from './answerPackage';
const report:AnswerPackage={mission_id:'m',title:'A usable solution',goal:'Build an accessible tracker',content:'## Solution\nCreate a task dashboard.',limitations:['Cost needs validation.'],sources:[{title:'Study',url:'https://example.org/study'}],master_approved:true,mode:'live',variant:'answer'};
test('copy includes the goal, complete answer, limitations and sources',()=>{
 const text=answerPlainText(report);
 for(const value of [report.title,report.goal,report.content,report.limitations[0],report.sources[0].url])expect(text).toContain(value);
});
test('prompt conversion preserves evidence and requests an actionable deliverable',()=>{
 const text=reusablePrompt(report,'en');
 for(const value of [report.goal,report.content,'acceptance criteria','do not merely summarize','Cost needs validation.','https://example.org/study'])expect(text).toContain(value);
 expect(text).toContain('not an independent fact check');
});
test('Arabic prompt remains structured and includes original reference content',()=>{
 const text=reusablePrompt(report,'ar');
 expect(text).toContain('# الهدف الأصلي');expect(text).toContain('# شكل الإجابة المطلوبة');expect(text).toContain(report.content);
});
