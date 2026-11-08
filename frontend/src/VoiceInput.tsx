import { HelpButton } from './Help';
import { useEffect,useRef,useState } from 'react';
import { Mic,Square,LoaderCircle,Check,Trash2,RotateCcw } from 'lucide-react';
import { Translate } from './i18n';
import { appendTranscript,MAX_RECORDING_SECONDS,MISSION_LIMIT,transcribeVoice,VoiceCapture } from './voice';
import './voice.css';

export function VoiceInput({mission,onChange,disabled,available,onBusyChange}:{mission:string;onChange:(text:string)=>void;disabled:boolean;available:boolean;onBusyChange:(busy:boolean)=>void}){
  const [phase,setPhase]=useState<'idle'|'requesting'|'recording'|'transcribing'|'review'|'error'>('idle');
  const [language,setLanguage]=useState('auto');
  const [seconds,setSeconds]=useState(0);
  const [error,setError]=useState('');
  const [transcript,setTranscript]=useState('');
  const [audio,setAudio]=useState<Blob|null>(null);
  const [audioUrl,setAudioUrl]=useState('');
  const capture=useRef<VoiceCapture|null>(null);
  const request=useRef<AbortController|null>(null);
  const generation=useRef(0);
  const started=useRef(0);
  const busy=['requesting','recording','transcribing'].includes(phase);
  const supported=typeof window!=='undefined'&&!!navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder!=='undefined';
  const merged=appendTranscript(mission,transcript);
  const tooLong=merged.length>MISSION_LIMIT;

  useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
  useEffect(()=>()=>{generation.current++;capture.current?.cancel();request.current?.abort();},[]);
  useEffect(()=>{
    if(!audio){setAudioUrl('');return;}
    const url=URL.createObjectURL(audio);setAudioUrl(url);return()=>URL.revokeObjectURL(url);
  },[audio]);
  useEffect(()=>{
    if(phase!=='recording')return;
    const timer=setInterval(()=>setSeconds(Math.min(MAX_RECORDING_SECONDS,Math.floor((Date.now()-started.current)/1000))),250);
    return()=>clearInterval(timer);
  },[phase]);
  function discard(){generation.current++;capture.current?.cancel();request.current?.abort();setAudio(null);setTranscript('');setError('');setPhase('idle');}
  useEffect(()=>{if(disabled)discard();},[disabled]);
  async function convert(blob:Blob,session:number){
    setAudio(blob);setPhase('transcribing');setError('');
    const controller=new AbortController();request.current=controller;
    const timeout=setTimeout(()=>controller.abort(),75000);
    try{
      const text=await transcribeVoice(blob,language,controller.signal);
      if(session!==generation.current)return;
      setTranscript(text);setPhase('review');
    }catch(cause){
      if(session!==generation.current)return;
      setError(controller.signal.aborted?'Transcription timed out. Your recording is available to retry. No automatic retry was made.':cause instanceof Error?cause.message:'Voice transcription failed. Please try again.');
      setPhase('error');
    }finally{clearTimeout(timeout);}
  }
  async function start(){
    if(disabled||busy||!available||!supported)return;
    discard();const session=++generation.current;
    setSeconds(0);setPhase('requesting');
    const recorder=new VoiceCapture(blob=>{if(session===generation.current)void convert(blob,session);},message=>{
      if(session===generation.current){setError(message);setPhase('error');}
    });
    capture.current=recorder;
    if(await recorder.start()&&session===generation.current){started.current=Date.now();setPhase('recording');}
  }
  return <Translate><section className={`voice-input voice-${phase}`} aria-label="Voice input">
    <div className="voice-toolbar"><div className="voice-title"><Mic size={19}/><div><strong>Speak your mission<HelpButton topic="voice"/></strong><span>Arabic or English · up to 2 minutes</span></div></div>
      <div className="voice-actions"><label className="voice-language">Spoken language<select aria-label="Spoken language" value={language} disabled={busy||disabled} onChange={e=>setLanguage(e.target.value)}><option value="auto">Arabic + English · auto</option><option value="ar">العربية</option><option value="en">English</option></select></label>
        {phase==='recording'?<button type="button" className="voice-stop" onClick={()=>capture.current?.stop()}><Square size={14}/>Stop & transcribe</button>:<button type="button" className="voice-record" onClick={()=>void start()} disabled={disabled||busy||!available||!supported}>{phase==='requesting'?<LoaderCircle size={16} className="voice-spinner"/>:<Mic size={16}/>} {phase==='requesting'?'Waiting for microphone…':audio?'Record again':'Record voice'}</button>}
        {busy&&<button type="button" onClick={discard}>Cancel</button>}
      </div></div>
    <p className="voice-disclosure">After you stop, audio is sent to OpenAI for transcription using the saved project key. API charges are separate from the mission spending limit. This app does not save the audio to disk.</p>
    {!supported&&<p className="voice-error">Voice recording is unavailable in this browser. Open this app in Chrome or Edge and allow microphone access.</p>}
    {!available&&<p className="voice-error">Voice transcription needs the saved backend OpenAI key.</p>}
    {phase==='recording'&&<div className="voice-live" role="status"><span className="voice-recording-dot"/><strong>Recording</strong><time dir="ltr">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} / 2:00</time><span>Speak naturally. Recording stops automatically after 2 minutes.</span></div>}
    {phase==='transcribing'&&<div className="voice-processing" role="status"><LoaderCircle size={18} className="voice-spinner"/>Converting your voice to text… You can continue typing above.</div>}
    {error&&<p className="voice-error" role="alert">{error}</p>}
    {audioUrl&&<audio controls src={audioUrl} aria-label="Your voice recording"/>}
    {phase==='error'&&audio&&<button type="button" onClick={()=>void convert(audio,generation.current)} disabled={disabled}><RotateCcw size={14}/>Try transcription again</button>}
    {phase==='review'&&<div className="voice-review"><label htmlFor="voice-transcript">Review your transcript</label><p>Edit any words, then add the text to your mission. Your existing text is kept.</p><textarea id="voice-transcript" aria-label="Voice transcript" dir="auto" value={transcript} onChange={e=>setTranscript(e.target.value)} maxLength={20000} disabled={disabled}/>
      {tooLong&&<p className="voice-error" role="alert">The combined mission exceeds 2000 characters. Shorten the transcript or mission before adding it. No words have been removed.</p>}
      <div className="voice-review-actions"><button type="button" className="voice-add" disabled={disabled||!transcript.trim()||tooLong} onClick={()=>{onChange(merged);discard();document.getElementById('mission')?.focus();}}><Check size={16}/>Add to mission</button><button type="button" onClick={discard}><Trash2 size={14}/>Discard recording</button><small>{merged.length} / 2000 characters after adding</small></div>
    </div>}
    {phase==='error'&&audio&&<button type="button" onClick={discard}>Discard recording</button>}
    {phase==='idle'&&<p className="voice-tip">Record → stop → review → add to mission. Your mission starts only when you submit it.</p>}
  </section></Translate>;
}
