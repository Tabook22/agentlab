import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {PracticeStudio} from './PracticeStudio';
import {LocaleProvider} from './i18n';
import {ExperimentLab} from './ExperimentLab';
import {EnergyChart,ProjectStudio} from './ProjectStudio';
import {studioError} from './studioErrors';

test('hands-on practice offers three connected experiences with honest execution labels',()=>{
 const html=renderToStaticMarkup(<PracticeStudio/>);
 for(const label of ['Join the team','Experiment lab','Project studio','no AI requests','shared server','REQUIREMENTS ANALYST','Start a new practice'])expect(html).toContain(label);
 expect(html).not.toContain('Preparing the experience');
});
test('the practice entry and assignment are available in Arabic',()=>{
 const html=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><PracticeStudio/></LocaleProvider>);
 for(const label of ['أنت جزء من العمل','انضم للفريق','مختبر التجارب','استوديو المشاريع','محلل المتطلبات','بلا طلبات AI'])expect(html).toContain(label);
 expect(html).not.toContain('Help the team design');
});

test('experiment controls ask for a prediction and distinguish scripted comparisons from AI benchmarks',()=>{
 const html=renderToStaticMarkup(<ExperimentLab onNext={()=>{}}/>);
 for(const label of ['not an AI benchmark','What do you predict','One worker versus three','Known versus missing data policy','Run the free comparison'])expect(html).toContain(label);
});
test('projects offer actual CSV analysis, source inspection and explicit synthetic sample labels in both languages',()=>{
 const english=renderToStaticMarkup(<ProjectStudio/>);
 for(const label of ['synthetic readings','not real university records','building,month,kwh','5,000 rows','Analyze the free sample','UTF-8 CSV'])expect(english).toContain(label);
 const arabic=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><ProjectStudio/></LocaleProvider>);
 expect(arabic).toContain('تحقيق عملي');
 expect(arabic).not.toContain('Investigate campus');
});
test('charts keep source names as escaped text and expose selection and numeric values accessibly',()=>{
 const html=renderToStaticMarkup(<EnergyChart totals={[{building:'<script>unsafe</script>',kwh:'0',observations:1},{building:'Library',kwh:'100',observations:1}]} selected="Library" onSelect={()=>{}} ar={false}/>);
 expect(html).not.toContain('<script>');
 expect(html).toContain('&lt;script&gt;');
 expect(html).toContain('aria-pressed="true"');
 expect(html).toContain('100');
 expect(html).toContain('width:0%');
});

test('Arabic CSV errors keep the exact row number and explain the repair',()=>{
 expect(studioError('CSV row 12: duplicate building and month. Resolve the duplicate before analysis.',true)).toContain('12');
 expect(studioError('CSV row 12: duplicate building and month. Resolve the duplicate before analysis.',true)).toContain('عالج التكرار');
 expect(studioError('CSV row 2: kwh supports at most three decimal places.',true)).toContain('ثلاث منازل');
 expect(studioError('CSV row 2: kwh supports at most three decimal places.',false)).toContain('CSV row 2');
});
