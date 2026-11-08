import { HelpButton } from './Help';
import { Translate, useLanguage, presetText } from './i18n';
import { ArrowRight, FlaskConical, Mic, Play, Radio } from 'lucide-react';
import { useState } from 'react';
import { MissionAttachments } from './MissionAttachments';
import {attachmentProblem,type MissionAttachment} from './attachments';
import { VoiceInput } from './VoiceInput';
export const grazingMission='Design a system to measure the grazing behaviour of cows, camels and goats in the Dhofar mountains of Oman, to protect rangeland and native vegetation and propose a better grazing system for farmers and their animals. Search the internet for similar peer-reviewed studies and relevant Dhofar/Oman evidence. Compare GPS and motion sensors, direct observation and vegetation monitoring; explain what each measures and how to validate animal behaviour. Produce an initial research-backed plan covering pilot design, seasonal sampling including khareef, animal welfare and farmer participation, system architecture, analysis, indicative cost assumptions, evaluation metrics and a phased implementation roadmap. Cite source links, separate evidence from proposed choices, and identify missing local data.';
export function MissionComposer({prompt,setPrompt,mode,setMode,maxWorkers,setMaxWorkers,available,model,busy,active,onLaunch,attachments=[],onAttachmentsChange=()=>{}}: {
  prompt:string;setPrompt:(v:string)=>void;mode:'live'|'simulation';setMode:(v:'live'|'simulation')=>void;
  maxWorkers:number;setMaxWorkers:(v:number)=>void;maxCycles:number;setMaxCycles:(v:number)=>void;
  budget:number;setBudget:(v:number)=>void;available:boolean;model:string;busy:boolean;active:boolean;onLaunch:()=>void;maxBudget?:number;attachments?:MissionAttachment[];onAttachmentsChange?:(files:MissionAttachment[])=>void;
}) {
  const {language}=useLanguage();
  const [voiceBusy,setVoiceBusy]=useState(false);
  const [attachmentBusy,setAttachmentBusy]=useState(false);
  const sourceProblem=attachmentProblem(attachments);
  return <Translate><form className="mission-composer" onSubmit={e=>{e.preventDefault();if(!voiceBusy&&!attachmentBusy&&!sourceProblem&&(!attachments.length||mode==='live')&&!busy&&!active&&prompt.trim().length>=5&&(mode!=='live'||available))onLaunch();}}>
    <div className="mission-question-label"><label className="mission-entry-label" htmlFor="mission">{attachments.length?'What should the master do with these files?':'What do you want your agents to do?'}</label><HelpButton topic="start"/></div>
    <textarea aria-label="Your custom mission" id="mission" dir="auto" value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={2000} placeholder="Example: Research grazing behaviour in Dhofar and propose a practical study plan with sources." disabled={active} required minLength={5}/><MissionAttachments files={attachments} onChange={onAttachmentsChange} comments={prompt} available={available} disabled={active||busy||voiceBusy} onBusy={setAttachmentBusy} onLive={()=>setMode('live')}/>
    <details className="voice-options" onToggle={e=>{if(voiceBusy&&!e.currentTarget.open)e.currentTarget.open=true;}}><summary><Mic size={17}/>Prefer to speak? Record your voice<span className="voice-option-hint">Arabic or English</span></summary><VoiceInput mission={prompt} onChange={setPrompt} disabled={active||busy} available={available} onBusyChange={setVoiceBusy}/></details>
    {mode==='live'&&<p className="mission-entry-help">Review the team and estimated cost before approving. Pause or cancel any time.</p>}<div className="mission-presets"><small>{prompt.length} / 2000 characters</small></div>
    <div className="mission-launch-row"><HelpButton topic="cost"/><label>Execution mode<select aria-label="Execution mode" value={mode} onChange={e=>setMode(e.target.value as 'live'|'simulation')} disabled={active||attachments.length>0}><option value="live">Live AI · mission-based team</option><option value="simulation">Simulation · classroom scenario</option></select></label><button type="submit" className="launch" disabled={voiceBusy||attachmentBusy||!!sourceProblem||(attachments.length>0&&mode!=='live')||busy||active||prompt.trim().length<5||(mode==='live'&&!available)}><Play size={18}/>{busy?'Preparing…':active?'Mission in progress':mode==='live'?'Ask commander for a plan':'Start simulation'}<ArrowRight size={16}/></button></div>
    <div className="mode-row"><span className={mode==='live'?'live-mode-pill':'simulation'}>{mode==='live'?<Radio size={12}/>:<FlaskConical size={12}/>} {mode==='live'?'LIVE AI':'SIMULATION'}</span><span>{mode==='live'?`1–${maxWorkers} workers · open-ended execution`:'No API key needed'}</span></div>
    {mode==='live'&&<p className="mission-cost-note"><strong>{'No app spending cap'}</strong> · {available?`${model} · API usage is billed. Estimates use configured model rates.`:'Live AI needs the saved backend key and a running backend. No key is entered in this browser.'}</p>}
    {active&&<p role="status">A mission is running. Pause or cancel it using the activity controls below.</p>}
    {mode==='live'&&<details className="mission-advanced"><summary>Team settings</summary><div className="live-request-limits"><label>Maximum workers<select aria-label="Maximum workers" value={maxWorkers} onChange={e=>setMaxWorkers(+e.target.value)} disabled={active}>{[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>Up to {n}</option>)}</select></label></div><p>Cost and time estimates are informational. There are no app spending, call, token, cycle or total-time caps.</p></details>}
  </form></Translate>;
}
