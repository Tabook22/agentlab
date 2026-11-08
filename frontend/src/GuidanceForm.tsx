import { apiBase } from './apiBase';
import { HelpButton } from './Help';
import { Translate } from './i18n';
import { useState } from 'react';
export function GuidanceForm({missionId,agentId}:{missionId:string;agentId:string}) {
  const [text,setText]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function send(){
    setBusy(true);setMessage('');
    try {
      const res=await fetch(`${apiBase}/missions/${missionId}/agents/${agentId}/guidance`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instruction:text})});
      const result=await res.json();if(!res.ok)throw new Error(typeof result.detail==='string'?result.detail:'Guidance was not recorded.');
      setText('');setMessage(result.summary);
    }catch(error:any){setMessage(error.message);}finally{setBusy(false);}
  }
  return <Translate>{<details className="guidance-form"><summary>Admin: guide this worker through the commander<HelpButton topic="control"/></summary><label>Clarification or correction<textarea aria-label="Commander guidance" value={text} maxLength={1500} onChange={e=>setText(e.target.value)} placeholder="State what should change and why."/></label><button onClick={()=>void send()} disabled={busy||text.trim().length<5}>{busy?'Recording…':'Send commander guidance'}</button><p role="status">{message||'Guidance is recorded immediately and acknowledged when the worker reads it. It does not silently change a completed output.'}</p></details>}</Translate>;
}
