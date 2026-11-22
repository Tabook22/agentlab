import {useEffect,useState} from 'react';
import {Users,FlaskConical,BarChart3,ArrowRight,CheckCircle2,RotateCcw} from 'lucide-react';
import {useLanguage} from './i18n';
import {studioApi,useStudioRun} from './studioApi';
import {SavedActivities} from './StudioSaved';
import {ProjectStudio} from './ProjectStudio';
import {studioError} from './studioErrors';
import './practiceStudio.css';
import {ExperimentLab} from './ExperimentLab';

export const studioChecks={
 borrow:['Borrowing marks the book borrowed','الاستعارة تغيّر حالة الكتاب إلى مُعار'],
 double_loan:['A second loan is blocked','تُمنع استعارة الكتاب المُعار'],
 return:['A return makes the book available again','الإعادة تتيح الكتاب مجددًا'],
 duration:['The loan lasts 1–14 days','مدة الاستعارة من يوم إلى ١٤ يومًا'],
} as const;
export function PracticeStudio(){
 const {language}=useLanguage(),ar=language==='ar';
 const [tab,setTab]=useState('participation');
 const tabs=[{id:'participation',icon:Users,en:'1 · Join the team',ar:'١ · انضم للفريق'},{id:'experiment',icon:FlaskConical,en:'2 · Experiment lab',ar:'٢ · مختبر التجارب'},{id:'project',icon:BarChart3,en:'3 · Project studio',ar:'٣ · استوديو المشاريع'}];
 return <section className="practice-studio" dir={ar?'rtl':'ltr'} aria-label={ar?'استوديو التدريب العملي':'Practice studio'}>
  <header className="studio-hero"><span>{ar?'تعلم بالمشاركة والتجربة والتطبيق':'PARTICIPATE · EXPERIMENT · APPLY'}</span><h1>{ar?'أنت جزء من العمل.':'You are part of the work.'}</h1><p>{ar?'قدّم مهمة للفريق، واختبر بدائل، وحوّل بياناتك إلى نتيجة قابلة للاستخدام.':'Contribute to a team, test alternatives, and turn your data into a usable result.'}</p><small>{ar?'أنشطة محلية مجانية بلا طلبات AI. تُحفظ النتائج على هذا الخادم المشترك، وليست حسابات طلاب منفصلة.':'Free local activities · no AI requests. Records are saved on this shared server, without separate student accounts.'}</small></header>
  <nav className="studio-tabs" aria-label={ar?'اختر تجربة عملية':'Choose a hands-on experience'}>{tabs.map(item=><button key={item.id} type="button" aria-current={tab===item.id?'page':undefined} onClick={()=>setTab(item.id)}><item.icon size={20}/>{ar?item.ar:item.en}</button>)}</nav>
  {tab==='participation'?<JoinTeam onNext={()=>setTab('experiment')}/>:tab==='experiment'?<ExperimentLab onNext={()=>setTab('project')}/>:<ProjectStudio/>}
 </section>;
}
export function JoinTeam({onNext}:{onNext:()=>void}){
 const {language}=useLanguage(),ar=language==='ar',s=useStudioRun('participation');
 const [rule,setRule]=useState(''),[borrow,setBorrow]=useState(''),[returned,setReturned]=useState(''),[days,setDays]=useState(14),[explanation,setExplanation]=useState('');
 useEffect(()=>{const last=s.run?.data.attempts?.at(-1)?.contract;setRule(last?.borrowing_rule??'');setBorrow(last?.after_borrow??'');setReturned(last?.after_return??'');setDays(last?.loan_days??14);setExplanation(last?.explanation??'');},[s.run?.id,s.run?.revision]);
 const attempts=s.run?.data.attempts??[],latest=attempts.at(-1),accepted=s.run?.status==='COMPLETED';
 const checkLabel=(id:string)=>studioChecks[id as keyof typeof studioChecks]?.[ar?1:0]??id;
 return <div className="studio-panel"><div className="studio-panel-heading"><div><span className="studio-kicker">{ar?'دورك: محلل المتطلبات':'YOUR ROLE · REQUIREMENTS ANALYST'}</span><h2>{ar?'ساعد الفريق على تصميم خدمة مكتبة':'Help the team design a library service'}</h2></div><button type="button" disabled={s.busy} onClick={()=>void s.perform(()=>studioApi('/participation',{request_id:crypto.randomUUID()}))}>{ar?'ابدأ تدريبًا جديدًا':'Start a new practice'}<ArrowRight size={16}/></button></div>
  <SavedActivities runs={s.runs} run={s.run} busy={s.busy} onOpen={id=>void s.open(id)} ar={ar}/>
  {s.error&&<p role="alert" className="studio-error">{studioError(s.error,ar)}</p>}{s.busy&&<p role="status">{ar?'جارٍ تحميل النشاط وحفظه…':'Loading and saving the activity…'}</p>}
  <div className="studio-brief"><h3>{ar?'تكليف القائد · محاكاة محلية':'Commander assignment · local simulation'}</h3><p>{ar?'نحتاج إلى قواعد استعارة واضحة. لا يستعير الطالب كتابًا مُعارًا، ويجب أن تتيح الإعادة الكتاب للطالب التالي. اختر مدة من يوم إلى ١٤ يومًا، واشرح قواعدك للمصمم.':'We need clear borrowing rules. A student cannot borrow a book already on loan, and returning it must make it available to the next student. Choose a loan of 1–14 days and explain your rules to the designer.'}</p><p>{ar?'سيُنفّذ المختبر قواعدك على كتاب تجريبي. الفحوص تختبر انتقال الحالات، ولا تُقيّم جودة شرحك بالذكاء الاصطناعي.':'The lab will execute your rules on a test book. Checks test state transitions; they do not use AI to grade your explanation.'}</p></div>
  {!s.run&&!s.busy&&<p>{ar?'ابدأ تدريبًا لاستلام المهمة وحفظ تقدمك.':'Start a practice to receive the task and save your progress.'}</p>}
  {s.run&&<><ol className="studio-steps"><li className="done">{ar?'١ · استلم التكليف':'1 · Receive the assignment'}</li><li className={latest?'done':''}>{ar?'٢ · قدّم واختبر وحسّن':'2 · Submit, test, improve'}</li><li className={accepted?'done':''}>{ar?'٣ · سلّم للمصمم':'3 · Hand off to the designer'}</li></ol>
   <form className="studio-contract" onSubmit={e=>{e.preventDefault();if(s.busy||accepted)return;void s.perform(()=>studioApi(`/participation/${s.run!.id}/submit`,{submission_id:crypto.randomUUID(),expected_revision:s.run!.revision,borrowing_rule:rule,after_borrow:borrow,after_return:returned,loan_days:days,explanation}));}}>
    <fieldset disabled={s.busy||accepted}><legend>{ar?'صمم عقد المهمة':'Design the task contract'}</legend><div className="studio-fields">
    <label>{ar?'متى تسمح بالاستعارة؟':'When is borrowing allowed?'}<select required value={rule} onChange={e=>setRule(e.target.value)}><option value="" disabled>{ar?'اختر قاعدة':'Choose a rule'}</option><option value="available_only">{ar?'عندما يكون الكتاب متاحًا فقط':'Only when the book is available'}</option><option value="any_book">{ar?'لأي كتاب، حتى لو كان مُعارًا':'Any book, even if already borrowed'}</option></select></label>
    <label>{ar?'حالة الكتاب بعد الاستعارة':'Book state after borrowing'}<select required value={borrow} onChange={e=>setBorrow(e.target.value)}><option value="" disabled>{ar?'اختر الحالة':'Choose a state'}</option><option value="available">{ar?'متاح':'Available'}</option><option value="borrowed">{ar?'مُعار':'Borrowed'}</option></select></label>
    <label>{ar?'حالة الكتاب بعد الإعادة':'Book state after returning'}<select required value={returned} onChange={e=>setReturned(e.target.value)}><option value="" disabled>{ar?'اختر الحالة':'Choose a state'}</option><option value="borrowed">{ar?'مُعار':'Borrowed'}</option><option value="available">{ar?'متاح':'Available'}</option></select></label>
    <label>{ar?'مدة الاستعارة بالأيام':'Loan duration in days'}<input type="number" min={1} max={30} required value={days} onChange={e=>setDays(Number(e.target.value))}/></label></div>
    <label>{ar?'اشرح قراراتك للمصمم':'Explain your decisions to the designer'}<textarea required minLength={10} maxLength={1500} dir="auto" value={explanation} onChange={e=>setExplanation(e.target.value)}/></label>
    <button type="submit">{ar?'قدّم قواعدي وشغّل الفحوص':'Submit my rules and run the checks'}<CheckCircle2 size={17}/></button></fieldset>
   </form>
   {latest&&<section className="studio-feedback" aria-live="polite"><h3>{accepted?(ar?'اجتازت قواعدك جميع الفحوص':'Your rules passed every check'):(ar?'ملاحظات القائد: حسّن القواعد':'Commander feedback: improve the rules')}</h3><ul>{latest.checks.map((check:any)=><li key={check.id} className={check.passed?'passed':'needs-work'}><strong>{check.passed?'✓':'↻'} {checkLabel(check.id)}</strong><span dir="ltr">{check.actual}</span>{!check.passed&&<p>{ar?`${checkLabel(check.id)}. غيّر القاعدة المرتبطة ثم أعد التقديم.`:check.feedback}</p>}</li>)}</ul></section>}
   {accepted&&<section className="studio-handoff"><span className="studio-kicker">{ar?'تسليم حقيقي داخل المحاكاة':'RECORDED HANDOFF WITHIN THE SIMULATION'}</span><h3>{ar?'أنت ← المصمم':'You → Designer'}</h3><p dir="auto">{s.run.data.handoff.contract.explanation}</p><ol><li>{ar?'افحص التوفر وامنع استعارة الكتاب المُعار.':'Check availability and block a loan of a borrowed book.'}</li><li>{ar?`سجّل الاستعارة لمدة ${s.run.data.handoff.contract.loan_days} يومًا وحدّث الحالة.`:`Record a ${s.run.data.handoff.contract.loan_days}-day loan and update the state.`}</li><li>{ar?'عند الإعادة، أتح الكتاب للطالب التالي.':'On return, make the book available to the next student.'}</li></ol><p>{ar?'استلم المصمم عقدك المقبول وأنتج هذا التدفق بقالب محلي. لم يُشغّل نموذج AI أو يُنشر تطبيق.':'The simulated designer received your accepted contract and produced this flow using a local template. No AI model ran and no app was deployed.'}</p><button type="button" onClick={onNext}>{ar?'التالي: اختبر فريقًا مختلفًا':'Next: test a different team'}<ArrowRight size={17}/></button></section>}
   <details className="studio-attempts"><summary><RotateCcw size={15}/>{ar?'سجل المحاولات':'Attempt history'} · {attempts.length}</summary>{attempts.map((attempt:any,index:number)=><article key={attempt.id}><h4>{ar?'المحاولة':'Attempt'} {index+1} · {attempt.accepted?(ar?'مقبولة':'Accepted'):(ar?'تحتاج إلى تحسين':'Needs revision')}</h4><p dir="auto">{attempt.contract.explanation}</p><p>{attempt.checks.filter((c:any)=>c.passed).length} / 4 {ar?'فحوص ناجحة':'checks passed'}</p><details><summary>{ar?'العقد المسجل والفحوص':'Recorded contract and checks'}</summary><pre dir="ltr" translate="no">{JSON.stringify(attempt,null,2)}</pre></details></article>)}</details>
  </>}
 </div>;
}
