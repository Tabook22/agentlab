import React, {createContext, useContext, useEffect, useState} from 'react';
import {apiBase} from './apiBase';
import './accounts.css';
import {setWorkspaceScope} from './accountFetch';

type User={id:string;username:string;role:'admin'|'user';active:boolean;created_at:string};
type Session={configured:boolean;can_setup:boolean;user:User|null;workspace:User|null};
type AccountState={session:Session;refresh:()=>Promise<void>;signOut:()=>Promise<void>;switchWorkspace:(id:string)=>Promise<void>};
const AccountContext=createContext<AccountState|null>(null);
export function useAccount(){const account=useContext(AccountContext);if(!account)throw new Error('Account session is missing.');return account;}

export async function accountApi(path:string,method='GET',body?:unknown){
 const response=await fetch(apiBase+path,{method,headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:`Request failed (${response.status}).`);
 return data;
}

export function AccountGate({children}:{children:React.ReactNode}){
 const [session,setSession]=useState<Session|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [name,setName]=useState(''),[password,setPassword]=useState('');
 async function refresh(){const latest:Session=await accountApi('/auth/session');setWorkspaceScope(latest.workspace?.id);setSession(latest);}
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
 // Recheck on tab focus and periodically so revoked/expired sessions close the
 // previous workspace and disconnect its mission stream.
 useEffect(()=>{const check=()=>{void refresh().catch(()=>{});};window.addEventListener('focus',check);const timer=window.setInterval(check,30000);return()=>{window.removeEventListener('focus',check);window.clearInterval(timer);};},[]);
 useEffect(()=>{const check=()=>{void refresh().catch(()=>{});};window.addEventListener('account-session-changed',check);return()=>window.removeEventListener('account-session-changed',check);},[]);
 async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await accountApi(session?.configured?'/auth/login':'/auth/setup','POST',{username:name,password});setPassword('');await refresh();}catch(cause){setError(cause instanceof Error?cause.message:'Could not sign in.');}finally{setBusy(false);}}
 if(!session)return <div className="account-gate"><div className="account-card"><h1>Agent Lab</h1><p>{error||'Opening your workspace…'}</p>{error&&<button onClick={()=>void refresh().catch(e=>setError(e.message))}>Try again</button>}</div></div>;
 if(!session.user)return <div className="account-gate"><form className="account-card" onSubmit={submit}><div className="eyebrow">AGENT LAB · YOUR OWN WORKSPACE</div><h1>{session.configured?'Welcome back.':'Create your administrator account.'}</h1><p>{session.configured?'Sign in to access your missions, files and practice activities.':'Manage student accounts and review their work. Existing lab records will belong to this administrator.'}</p>{!session.configured&&!session.can_setup?<p role="alert">Open the app locally or through the configured administrator proxy to complete initial setup.</p>:<><label>Username<input autoComplete="username" minLength={3} maxLength={80} required value={name} onChange={e=>setName(e.target.value)} autoFocus/></label><label>Password<input type="password" autoComplete={session.configured?'current-password':'new-password'} minLength={session.configured?1:10} maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)}/></label>{!session.configured&&<small>Use at least 10 characters. Your password is stored as a salted hash.</small>}{error&&<p className="account-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Please wait…':session.configured?'Sign in':'Create administrator & open workspace'}</button></>}</form></div>;
 const account:AccountState={session,refresh,signOut:async()=>{await accountApi('/auth/logout','POST');await refresh();},switchWorkspace:async id=>{await accountApi(`/admin/workspace/${id}`,'POST');await refresh();}};
 return <AccountContext.Provider value={account}><React.Fragment key={`${session.user.id}:${session.workspace?.id}`}>{children}</React.Fragment></AccountContext.Provider>;
}

export function AccountControls(){
 const {session,signOut,switchWorkspace}=useAccount();const [error,setError]=useState('');
 const helping=session.workspace?.id!==session.user?.id;
 return <div className="account-controls"><strong>{session.workspace?.username}’s workspace</strong><small>{helping?`Admin: ${session.user?.username} · reviewing this user's work`:session.user?.role==='admin'?'Administrator':'Student account'}</small>{helping&&<button onClick={()=>void switchWorkspace(session.user!.id).catch(e=>setError(e.message))}>Return to my workspace</button>}<button onClick={()=>void signOut().catch(e=>setError(e.message))}>Sign out</button>{error&&<span role="alert">{error}</span>}</div>;
}

export function UserManagement(){
 const {session,switchWorkspace,refresh}=useAccount();
 const [users,setUsers]=useState<User[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [name,setName]=useState(''),[password,setPassword]=useState(''),[editing,setEditing]=useState<User|null>(null),[deleting,setDeleting]=useState<string|null>(null);
 async function load(){setUsers(await accountApi('/admin/users'));}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 async function perform(work:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await work();await load();}catch(cause){setError(cause instanceof Error?cause.message:'Could not update accounts.');}finally{setBusy(false);}}
 async function save(event:React.FormEvent){event.preventDefault();await perform(async()=>{await accountApi(editing?`/admin/users/${editing.id}`:'/admin/users',editing?'PATCH':'POST',{username:name,...(password?{password}:{})});setMessage(editing?'Account updated. Previous sign-ins have been revoked.':'Account created. Give this username and password to the student securely.');setName('');setPassword('');if(editing?.id===session.user?.id)await refresh();setEditing(null);});}
 return <section className="accounts-page"><div className="eyebrow">ADMINISTRATION</div><h1>Users & workspaces</h1><p>Each user has separate missions, attachments and practice records. Open a workspace to review work, guide agents, or pause and cancel missions.</p>{error&&<p className="account-error" role="alert">{error}</p>}{message&&<p className="account-success" role="status">{message}</p>}<form className="panel account-editor" onSubmit={save}><h2>{editing?`Edit ${editing.username}`:'Create a user'}</h2><label>Username<input required minLength={3} maxLength={80} autoComplete="off" value={name} onChange={e=>setName(e.target.value)}/></label><label>{editing?'New password (leave blank to keep current password)':'Password'}<input type="password" autoComplete="new-password" required={!editing} minLength={10} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label><small>At least 10 characters. Passwords cannot be viewed after saving; you can assign a new one.</small><div className="account-actions"><button className="primary" disabled={busy}>{editing?'Save account':'Create user'}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setName('');setPassword('');}}>Cancel editing</button>}</div></form><div className="panel account-users"><h2>Accounts ({users.length})</h2><div className="account-table"><table><thead><tr><th>Username</th><th>Access</th><th>Actions</th></tr></thead><tbody>{users.map(user=><tr key={user.id}><td><strong>{user.username}</strong>{user.id===session.workspace?.id&&<small>Current workspace</small>}</td><td>{user.role==='admin'?'Administrator':user.active?'Student · enabled':'Student · disabled'}</td><td><div className="account-actions"><button disabled={busy} onClick={()=>void perform(async()=>{await switchWorkspace(user.id);})}>Open workspace</button><button disabled={busy} onClick={()=>{setEditing(user);setName(user.username);setPassword('');setDeleting(null);}}>Edit credentials</button>{user.id!==session.user?.id&&<><button disabled={busy} onClick={()=>void perform(async()=>{await accountApi(`/admin/users/${user.id}`,'PATCH',{active:!user.active});setMessage(user.active?'Account disabled and running missions stopped.':'Account enabled.');})}>{user.active?'Disable':'Enable'}</button><button disabled={busy} className="account-danger" onClick={()=>setDeleting(user.id)}>Delete</button></>}</div>{deleting===user.id&&<div className="account-delete"><p>Delete {user.username}’s account? Sign-ins will be revoked and active work stopped. Saved work is archived in the database.</p><button disabled={busy} className="account-danger" onClick={()=>void perform(async()=>{await accountApi(`/admin/users/${user.id}`,'DELETE');setDeleting(null);setMessage('Account deleted.');await refresh();})}>Confirm delete account</button><button disabled={busy} onClick={()=>setDeleting(null)}>Keep account</button></div>}</td></tr>)}</tbody></table></div></div></section>;
}
