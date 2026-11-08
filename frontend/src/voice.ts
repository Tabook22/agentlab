export const MAX_RECORDING_SECONDS=120;
export const MAX_AUDIO_BYTES=10*1024*1024;
export const MISSION_LIMIT=2000;

export function appendTranscript(mission:string,transcript:string){
  const prefix=mission.trimEnd(),speech=transcript.trim();
  return prefix&&speech?`${prefix}\n${speech}`:prefix||speech;
}

export function microphoneError(error:unknown):string {
  const name=(error as {name?:string})?.name;
  if(name==='NotAllowedError'||name==='SecurityError')return 'Microphone access was blocked. Allow the microphone in your browser settings, or open this app in Chrome or Edge.';
  if(name==='NotFoundError')return 'No microphone was found. Connect a microphone and try again.';
  if(name==='NotReadableError')return 'The microphone is unavailable. Close other apps using it and try again.';
  return 'Could not start recording. Check your microphone and try again.';
}

// Owns the microphone lifetime, including permission requests that resolve after cancellation.
export class VoiceCapture {
  private stream?:MediaStream;
  private recorder?:MediaRecorder;
  private timer?:ReturnType<typeof setTimeout>;
  private chunks:Blob[]=[];
  private size=0;
  private disposed=false;
  constructor(private recorded:(blob:Blob)=>void,private failed:(message:string)=>void,
    private media:Pick<MediaDevices,'getUserMedia'>=navigator.mediaDevices,
    private Recorder:typeof MediaRecorder=MediaRecorder){}
  async start(){
    try{
      const stream=await this.media.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(this.disposed){stream.getTracks().forEach(track=>track.stop());return false;}
      this.stream=stream;
      const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type=>this.Recorder.isTypeSupported(type));
      if(!mime)throw new Error('Unsupported recording format');
      const recorder=new this.Recorder(stream,{mimeType:mime,audioBitsPerSecond:64000});
      this.recorder=recorder;
      recorder.ondataavailable=event=>{
        if(this.disposed||!event.data.size)return;
        this.size+=event.data.size;
        if(this.size>MAX_AUDIO_BYTES){this.cancel();this.failed('Recording is too large. Record a shorter message.');return;}
        this.chunks.push(event.data);
      };
      recorder.onerror=()=>{this.cancel();this.failed('Recording was interrupted. Please record again.');};
      recorder.onstop=()=>{
        this.release();
        if(this.disposed)return;
        const blob=new Blob(this.chunks,{type:recorder.mimeType});
        this.chunks=[];
        if(blob.size<32){this.failed('The recording is empty. Please record again.');return;}
        this.recorded(blob);
      };
      recorder.start(1000);
      this.timer=setTimeout(()=>this.stop(),MAX_RECORDING_SECONDS*1000);
      return true;
    }catch(error){if(!this.disposed){this.release();this.failed(microphoneError(error));}return false;}
  }
  stop(){if(this.recorder?.state==='recording')this.recorder.stop();this.release();}
  cancel(){this.disposed=true;this.stop();this.chunks=[];}
  private release(){clearTimeout(this.timer);this.stream?.getTracks().forEach(track=>track.stop());}
}

export async function transcribeVoice(blob:Blob,language:string,signal:AbortSignal){
  const response=await fetch(`/api/voice/transcribe?language=${encodeURIComponent(language)}`,{
    method:'POST',headers:{'Content-Type':blob.type,'X-Voice-Input':'mission-composer'},body:blob,signal,
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof body.detail==='string'?body.detail:'Voice transcription failed. Please try again.');
  if(typeof body.text!=='string'||!body.text.trim())throw new Error('No speech was detected. Speak clearly and record again.');
  return body.text as string;
}
