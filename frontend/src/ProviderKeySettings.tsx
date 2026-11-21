import {useState} from 'react';
import {KeyRound,LockKeyhole} from 'lucide-react';
import {apiBase} from './apiBase';
import {useLanguage} from './i18n';
import './providerSettings.css';

export function ProviderKeySettings({configured,onSaved}:{configured:boolean;onSaved:()=>Promise<void>}) {
 const {language}=useLanguage(),ar=language==='ar';
 const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 async function save(){
  if(busy||!key.trim())return;
  setBusy(true);setError('');setSaved(false);
  const submitted=key.trim();setKey('');
  try {
   const response=await fetch(`${apiBase}/settings/provider/key`,{method:'PUT',cache:'no-store',headers:{'Content-Type':'application/json','X-Admin-Action':'update-provider-key'},body:JSON.stringify({api_key:submitted})});
   const body=await response.json();
   if(!response.ok)throw Error(typeof body.detail==='string'?body.detail:'Could not save the API key.');
   await onSaved();setSaved(true);
  } catch(cause){setError(cause instanceof Error?cause.message:'Could not save the API key.');}
  finally{setBusy(false);}
 }
 return <section className="panel provider-key-settings" aria-label={ar?'إعدادات مفتاح OpenAI للمسؤول':'Admin OpenAI API key settings'}>
  <header><span><KeyRound size={23}/></span><div><small>{ar?'إعدادات المسؤول':'ADMIN SETTINGS'}</small><h2>{ar?'مفتاح OpenAI API':'OpenAI API key'}</h2></div><strong className={configured?'key-configured':'key-missing'}>{configured?(ar?'المفتاح مضاف':'Key configured'):(ar?'لم يُضف مفتاح':'No key configured')}</strong></header>
  <p>{ar?'أضف مفتاحك أو استبدله لتفعيل الذكاء الاصطناعي المباشر والبحث وقراءة الصور وتحويل الصوت إلى نص. تُحتسب رسوم الاستخدام على حساب OpenAI الخاص بك.':'Add or replace your key to enable Live AI, research, image reading, and voice transcription. Usage is billed to your OpenAI API account.'}</p>
  <form onSubmit={e=>{e.preventDefault();void save();}}>
   <label htmlFor="openai-admin-key">{configured?(ar?'المفتاح البديل':'Replacement API key'):(ar?'مفتاح API الجديد':'New API key')}</label>
   <input id="openai-admin-key" name="openai-api-key" type="password" dir="ltr" autoComplete="new-password" spellCheck={false} value={key} maxLength={512} disabled={busy} onChange={e=>{setKey(e.target.value);setSaved(false);}} placeholder="sk-…" required/>
   <button type="submit" disabled={busy||!key.trim()}><LockKeyhole size={16}/>{busy?(ar?'جارٍ الحفظ…':'Saving…'):configured?(ar?'استبدال المفتاح':'Replace API key'):(ar?'حفظ المفتاح':'Save API key')}</button>
  </form>
  <p className="provider-key-privacy">{ar?'يُحفظ المفتاح على الخادم، ويبقى بعد تحديث التطبيق. لا يُعرض المفتاح المحفوظ ولا يُحفظ في متصفحك. يبدأ استخدامه فوراً دون إعادة تشغيل.':'Saved on the server and retained across app updates. The saved key is never displayed or stored in your browser. It takes effect immediately without a restart.'}</p>
  <small>{ar?'حفظ المفتاح لا يجري اتصالاً مدفوعاً. سيُتحقق من صلاحياته عند استخدامه لأول مرة.':'Saving makes no paid API request. Access is verified when you first use the key.'}</small>
  {saved&&<p className="provider-key-success" role="status">{ar?'تم حفظ المفتاح. يمكنك الآن العودة إلى المهمة واستخدام التسجيل الصوتي أو Live AI.':'API key saved. Return to your mission to use voice transcription or Live AI.'}</p>}
  {error&&<p className="provider-key-error" role="alert">{error}</p>}
 </section>;
}
