import {afterEach,expect,test,vi} from 'vitest';
import {appendTranscript,MAX_RECORDING_SECONDS,MISSION_LIMIT,microphoneError,transcribeVoice,VoiceCapture} from './voice';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

test('Arabic and English transcripts append to the current text without truncation',()=>{
 expect(appendTranscript('Existing mission  ','صمم دراسة')).toBe('Existing mission\nصمم دراسة');
 expect(appendTranscript('','  Explain DNS.  ')).toBe('Explain DNS.');
 const long='أ'.repeat(2100);
 expect(appendTranscript('Existing mission',long).length).toBeGreaterThan(MISSION_LIMIT);
 expect(appendTranscript('Existing mission',long)).toContain(long);
});

function harness(){
 const stop=vi.fn();const stream={getTracks:()=>[{stop}]} as unknown as MediaStream;
 const recorded=vi.fn(),failed=vi.fn();
 let instance:FakeRecorder;
 class FakeRecorder{
  static isTypeSupported(type:string){return type==='audio/webm;codecs=opus';}
  state='inactive';mimeType='audio/webm;codecs=opus';
  ondataavailable?: (event:{data:Blob})=>void;onstop?:()=>void;onerror?:()=>void;
  constructor(){instance=this;}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['a'.repeat(64)])});this.onstop?.();}
 }
 const media={getUserMedia:vi.fn().mockResolvedValue(stream)};
 const capture=new VoiceCapture(recorded,failed,media,FakeRecorder as unknown as typeof MediaRecorder);
 return {capture,media,stream,stop,recorded,failed,recorder:()=>instance};
}

test('stopping releases microphone and emits one audio blob',async()=>{
 const h=harness();expect(await h.capture.start()).toBe(true);
 h.capture.stop();h.capture.stop();
 expect(h.stop).toHaveBeenCalled();expect(h.recorded).toHaveBeenCalledTimes(1);
 expect(h.recorded.mock.calls[0][0].type).toBe('audio/webm;codecs=opus');
});

test('discard and late permission resolution do not capture or transcribe audio',async()=>{
 const h=harness();let allow!:(stream:MediaStream)=>void;
 h.media.getUserMedia.mockImplementation(()=>new Promise(resolve=>{allow=resolve;}));
 const pending=h.capture.start();h.capture.cancel();allow(h.stream);
 expect(await pending).toBe(false);expect(h.stop).toHaveBeenCalled();expect(h.recorded).not.toHaveBeenCalled();
});

test('time limit stops the recorder and discard suppresses callbacks',async()=>{
 vi.useFakeTimers();const h=harness();await h.capture.start();
 vi.advanceTimersByTime(MAX_RECORDING_SECONDS*1000);
 expect(h.recorded).toHaveBeenCalledTimes(1);expect(h.stop).toHaveBeenCalled();
 const cancelled=harness();await cancelled.capture.start();cancelled.capture.cancel();
 vi.runAllTimers();expect(cancelled.recorded).not.toHaveBeenCalled();
});

test('permission denial is clear and never produces a transcript',async()=>{
 const h=harness();h.media.getUserMedia.mockRejectedValue({name:'NotAllowedError'});
 expect(await h.capture.start()).toBe(false);
 expect(h.failed.mock.calls[0][0]).toContain('Microphone access was blocked');
 expect(h.recorded).not.toHaveBeenCalled();
 expect(microphoneError({name:'NotFoundError'})).toContain('No microphone');
});

test('transcription sends audio with language and requires usable text',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({text:'اشرح الفكرة'})});vi.stubGlobal('fetch',fetch);
 const audio=new Blob(['recording'],{type:'audio/webm'});const signal=new AbortController().signal;
 expect(await transcribeVoice(audio,'ar',signal)).toBe('اشرح الفكرة');
 expect(fetch).toHaveBeenCalledWith('/api/voice/transcribe?language=ar',expect.objectContaining({body:audio,signal}));
 fetch.mockResolvedValue({ok:true,json:async()=>({text:''})});
 await expect(transcribeVoice(audio,'ar',signal)).rejects.toThrow('No speech');
});
