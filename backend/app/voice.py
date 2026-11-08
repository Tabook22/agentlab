"""Bounded, explicit voice transcription. Audio is kept in memory, never in the DB."""
import asyncio
import os
from typing import Literal
import httpx
from fastapi import APIRouter, HTTPException, Request

MAX_AUDIO_BYTES = 10 * 1024 * 1024
FORMATS = {'audio/webm': ('webm', lambda b: b.startswith(b'\x1aE\xdf\xa3')),
           'audio/mp4': ('mp4', lambda b: b[4:8] == b'ftyp'),
           'audio/wav': ('wav', lambda b: b.startswith(b'RIFF') and b[8:12] == b'WAVE')}


def voice_router(transport=None):
    router = APIRouter(prefix='/api/voice')
    lock = asyncio.Lock()

    @router.post('/transcribe')
    async def transcribe(request: Request, language: Literal['auto', 'ar', 'en'] = 'auto'):
        if request.headers.get('x-voice-input') != 'mission-composer':
            raise HTTPException(403, 'Use the voice input control to submit a recording.')
        key = os.getenv('OPENAI_API_KEY', '').strip()
        if not key:
            raise HTTPException(503, 'Voice transcription needs the saved backend OpenAI key.')
        mime = request.headers.get('content-type', '').split(';')[0].strip().lower()
        if mime not in FORMATS:
            raise HTTPException(415, 'Use a WebM, MP4 or WAV audio recording.')
        try:
            length = int(request.headers.get('content-length', '0'))
        except ValueError:
            raise HTTPException(400, 'Invalid recording size.')
        if length > MAX_AUDIO_BYTES:
            raise HTTPException(413, 'Recording is too large. Record a shorter message.')
        if lock.locked():
            raise HTTPException(429, 'Another recording is being transcribed. Please wait.')
        async with lock:
            audio = bytearray()
            try:
                async with asyncio.timeout(30):
                    async for chunk in request.stream():
                        if len(audio) + len(chunk) > MAX_AUDIO_BYTES:
                            raise HTTPException(413, 'Recording is too large. Record a shorter message.')
                        audio.extend(chunk)
            except TimeoutError:
                raise HTTPException(408, 'Recording upload timed out. Try again when the connection is ready.')
            extension, matches = FORMATS[mime]
            if len(audio) < 32 or not matches(audio):
                raise HTTPException(422, 'The recording is empty or invalid. Please record again.')
            fields = {'model': 'gpt-transcribe', 'response_format': 'json',
                      'languages[]': ['ar', 'en'] if language == 'auto' else [language]}
            try:
                async with httpx.AsyncClient(timeout=60, transport=transport, trust_env=False) as client:
                    response = await client.post('https://api.openai.com/v1/audio/transcriptions',
                        headers={'Authorization': f'Bearer {key}'}, data=fields,
                        files={'file': (f'mission-voice.{extension}', bytes(audio), mime)})
                if response.status_code >= 400:
                    messages = {401: 'OpenAI rejected the saved key. Check the backend configuration.',
                                403: 'The saved key does not have access to voice transcription.',
                                429: 'Voice transcription quota or rate limit reached. Please try later.',
                                400: 'The audio could not be transcribed. Try a shorter, clearer recording.'}
                    raise HTTPException(502, messages.get(response.status_code, 'Voice transcription is temporarily unavailable. Please try later.'))
                body = response.json()
                text = body.get('text')
                if not isinstance(text, str) or not text.strip():
                    raise HTTPException(422, 'No speech was detected. Speak clearly and record again.')
                if len(text) > 20000:
                    raise HTTPException(502, 'The transcript was too long. Please record a shorter message.')
                return {'text': text.strip(), 'language': language, 'model': 'gpt-transcribe'}
            except httpx.TimeoutException:
                raise HTTPException(504, 'Transcription timed out. Your recording is available to retry. No automatic retry was made.')
            except httpx.RequestError:
                raise HTTPException(502, 'Could not connect to voice transcription. Your recording is available to retry.')
            except (ValueError, TypeError, AttributeError):
                raise HTTPException(502, 'Voice transcription returned an unreadable response. Please try again.')
            finally:
                audio.clear()

    return router
