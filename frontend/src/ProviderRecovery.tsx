import type {LabEvent} from './events';
import {useLanguage} from './i18n';

export function providerFailure(events:LabEvent[]){
 const failed=events.findLast(e=>e.type==='mission.failed');
 if(!failed)return null;
 const summary=String(failed.payload.summary??'');
 if(!failed.payload.provider_issue&&!/OpenAI.*(rate limit|quota|credit|spend|billing|HTTP 429)/i.test(summary))return null;
 return {code:String(failed.payload.provider_issue??'legacy_429'),summary};
}
export function ProviderRecovery({events,status,onRecover}:{events:LabEvent[];status:string;onRecover?:()=>void}){
 const issue=providerFailure(events);const {language}=useLanguage();const ar=language==='ar';
 if(status!=='FAILED'||!issue)return null;
 const unknown=['legacy_429','unknown_429'].includes(issue.code);
 return <aside className="provider-recovery" aria-label={ar?'استعادة الاتصال بالمزود':'Provider recovery'}>
  <strong>{ar?'العمل محفوظ — راجع حساب OpenAI API':'Work is saved — check your OpenAI API account'}</strong>
  <p>{unknown?(ar?'لم يتم حفظ السبب الدقيق لهذا الخطأ. قد يكون تقييداً مؤقتاً للطلبات أو مشكلة في الرصيد أو الفوترة.':'The exact cause was not recorded for this error. It may be temporary request throttling or an API credit or billing issue.'):(ar?'راجع الرصيد والفوترة وحدود المؤسسة أو المشروع الموضحة أعلاه.':'Review the API credits, billing or organization/project limit identified above.')}</p>
  <p>{ar?'حدود التطبيق مفتوحة، لكن حدود مزود الخدمة تبقى سارية. بعد حل المشكلة، افتح لوحة النشاط واختر متابعة المهمة المحفوظة. ستستأنف رسوم API عند المتابعة.':'The app has no execution caps, but OpenAI account limits still apply. After resolving the account issue, open Live board and choose Continue saved mission. API charges resume when you continue.'}</p>
  {onRecover&&<button type="button" onClick={onRecover}>{ar?'فتح خيارات المتابعة':'Open recovery controls'}</button>}
  <a href="https://platform.openai.com/usage" target="_blank" rel="noreferrer">{ar?'فتح استخدام OpenAI API':'Open OpenAI API usage'}</a>
 </aside>;
}
