import {afterEach,expect,test,vi} from 'vitest';
import {accountFetch,setWorkspaceScope} from './accountFetch';

afterEach(()=>{setWorkspaceScope(undefined);vi.unstubAllGlobals();});

test('requests carry the workspace active in this tab without dropping upload headers',async()=>{
 const send=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',send);
 setWorkspaceScope('alice');
 await accountFetch('/api/attachments',{method:'POST',headers:{'X-Attachment-Upload':'mission-composer'},body:'data'});
 const init=send.mock.calls[0][1] as RequestInit;
 expect(new Headers(init.headers).get('X-Workspace-Id')).toBe('alice');
 expect(new Headers(init.headers).get('X-Attachment-Upload')).toBe('mission-composer');
 expect(init.body).toBe('data');
});

test('expired accounts and stale workspace tabs ask the account gate to refresh',async()=>{
 const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});
 const send=vi.fn().mockResolvedValueOnce(new Response('{}',{status:401})).mockResolvedValueOnce(new Response('{}',{status:409,headers:{'X-Workspace-Changed':'true'}})).mockResolvedValueOnce(new Response('{}',{status:409}));vi.stubGlobal('fetch',send);
 await accountFetch('/api/missions');await accountFetch('/api/missions');await accountFetch('/api/missions');
 expect(dispatchEvent).toHaveBeenCalledTimes(2);
 expect(dispatchEvent.mock.calls[0][0].type).toBe('account-session-changed');
});
