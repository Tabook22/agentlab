// A stale browser tab must not create work in a newly selected workspace.
let workspaceId:string|undefined;
export function setWorkspaceScope(id:string|undefined){workspaceId=id;}
export async function accountFetch(input:RequestInfo|URL,init?:RequestInit){
 const headers=new Headers(init?.headers);
 if(workspaceId)headers.set('X-Workspace-Id',workspaceId);
 const response=await fetch(input,{...init,headers});
 if(typeof window!=='undefined'&&(response.status===401||response.status===409&&response.headers.get('X-Workspace-Changed')==='true'))window.dispatchEvent(new Event('account-session-changed'));
 return response;
}
