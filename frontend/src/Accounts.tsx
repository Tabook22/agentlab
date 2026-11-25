import React, {createContext, useContext, useEffect, useState} from 'react';
import {apiBase} from './apiBase';
import './accounts.css';
import {setWorkspaceScope} from './accountFetch';

type User={id:string;username:string;role:'super_admin'|'user';active:boolean;created_at:string};
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
 async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await accountApi('/auth/login','POST',{username:name,password});setPassword('');await refresh();}catch(cause){setError(cause instanceof Error?cause.message:'Could not sign in.');}finally{setBusy(false);}}
 if(!session)return <div className="account-gate"><div className="account-card"><h1>Agent Lab</h1><p>{error||'Opening your workspace…'}</p>{error&&<button onClick={()=>void refresh().catch(e=>setError(e.message))}>Try again</button>}</div></div>;
 if(!session.user)return <div className="account-gate">
  <form className="account-card" onSubmit={submit}>
   <div className="eyebrow">AGENT LAB · ASSIGNED WORKSPACES</div>
   <h1>Sign in to your workspace.</h1>
   <p>Use the username and password provided by Nasser, the super admin.</p>
   <label>Username<input autoComplete="username" minLength={3} maxLength={80} required value={name} onChange={e=>setName(e.target.value)} autoFocus/></label>
   <label>Password<input type="password" autoComplete="current-password" maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
   {error&&<p className="account-error" role="alert">{error}</p>}
   <button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
   <div className="account-access-note"><strong>Need access?</strong><p>Only Nasser can create your account and assign your private workspace. Users cannot register or create workspaces themselves.</p></div>
  </form>
 </div>;
 const account:AccountState={session,refresh,signOut:async()=>{await accountApi('/auth/logout','POST');await refresh();},switchWorkspace:async id=>{await accountApi(`/admin/workspace/${id}`,'POST');await refresh();}};
 return <AccountContext.Provider value={account}><React.Fragment key={`${session.user.id}:${session.workspace?.id}`}>{children}</React.Fragment></AccountContext.Provider>;
}

export function AccountControls(){
 const {session,signOut,switchWorkspace}=useAccount();const [error,setError]=useState('');
 const helping=session.workspace?.id!==session.user?.id;
 return <div className="account-controls"><strong>{session.workspace?.username}’s workspace</strong><small>{helping?`Admin: ${session.user?.username} · reviewing this user's work`:session.user?.role==='super_admin'?'Super admin · Nasser':'User · workspace assigned by Nasser'}</small>{helping&&<button onClick={()=>void switchWorkspace(session.user!.id).catch(e=>setError(e.message))}>Return to my workspace</button>}<button onClick={()=>void signOut().catch(e=>setError(e.message))}>Sign out</button>{error&&<span role="alert">{error}</span>}</div>;
}

export function UserManagement(){
 const {session,switchWorkspace,refresh}=useAccount();
 const [users,setUsers]=useState<User[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [name,setName]=useState(''),[password,setPassword]=useState(''),[editing,setEditing]=useState<User|null>(null),[deleting,setDeleting]=useState<string|null>(null);
 async function load(){setUsers(await accountApi('/admin/users'));}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 async function perform(work:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await work();await load();}catch(cause){setError(cause instanceof Error?cause.message:'Could not update accounts.');}finally{setBusy(false);}}
 async function save(event:React.FormEvent){event.preventDefault();await perform(async()=>{await accountApi(editing?`/admin/users/${editing.id}`:'/admin/users',editing?'PATCH':'POST',{username:name,...(password?{password}:{})});setMessage(editing?'Account updated. Previous sign-ins have been revoked.':'User workspace created. Give the assigned username and password to this user securely.');setName('');setPassword('');if(editing?.id===session.user?.id)await refresh();setEditing(null);});}
 return <section className="accounts-page">
  <div className="eyebrow">SUPER ADMIN · NASSER</div>
  <h1>Manage user workspaces</h1>
  <p>You are the only super admin. Create each user's private workspace and assign their username and password. Users can sign in and work inside their assigned workspace; they cannot create accounts or additional workspaces.</p>
  <div className="account-policy-grid">
   <div><strong>1. Create a workspace</strong><p>Enter the user's assigned username and password below.</p></div>
   <div><strong>2. Give the user access</strong><p>Share those credentials securely. Their workspace is already ready when they sign in.</p></div>
   <div><strong>3. Supervise and support</strong><p>Open their workspace to review missions, guide agents, or stop work.</p></div>
  </div>
  {error&&<p className="account-error" role="alert">{error}</p>}
  {message&&<p className="account-success" role="status">{message}</p>}
  <form className="panel account-editor" onSubmit={save}>
   <h2>{editing?`Manage access: ${editing.username}`:'Create a user workspace'}</h2>
   <p>{editing?'Update the assigned credentials. Previous sign-ins will be revoked.':'This creates one user account with one separate workspace. Only you can do this.'}</p>
   <label>Assigned username<input required minLength={3} maxLength={80} autoComplete="off" readOnly={editing?.role==='super_admin'} value={name} onChange={e=>setName(e.target.value)}/></label>
   <label>{editing?'Replacement password (optional)':'Assigned password'}<input type="password" autoComplete="new-password" required={!editing} minLength={10} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <small>Use at least 10 characters. Saved passwords cannot be viewed; you can assign a replacement.</small>
   <div className="account-actions">
    <button className="primary" disabled={busy}>{editing?'Save access changes':'Create workspace & user access'}</button>
    {editing&&<button type="button" onClick={()=>{setEditing(null);setName('');setPassword('');}}>Cancel editing</button>}
   </div>
  </form>
  <div className="panel account-users">
   <h2>Assigned workspaces ({users.filter(user=>user.role==='user').length})</h2>
   <p>Nasser's super-admin account is permanent. All other accounts are users with one assigned workspace.</p>
   <div className="account-table"><table>
    <thead><tr><th>User / workspace</th><th>Access level</th><th>Manage</th></tr></thead>
    <tbody>{users.map(user=><tr key={user.id}>
     <td><strong>{user.username}</strong><small>{user.role==='super_admin'?'Super-admin workspace':'Private assigned workspace'}</small>{user.id===session.workspace?.id&&<small>Currently open</small>}</td>
     <td>{user.role==='super_admin'?'Sole super admin':user.active?'User · enabled':'User · disabled'}</td>
     <td>
      <div className="account-actions">
       <button disabled={busy} onClick={()=>void perform(async()=>{await switchWorkspace(user.id);})}>Open workspace</button>
       <button disabled={busy} onClick={()=>{setEditing(user);setName(user.username);setPassword('');setDeleting(null);}}>Manage credentials</button>
       {user.role!=='super_admin'&&<>
        <button disabled={busy} onClick={()=>void perform(async()=>{await accountApi(`/admin/users/${user.id}`,'PATCH',{active:!user.active});setMessage(user.active?'User access disabled and running missions stopped.':'User access enabled.');})}>{user.active?'Disable access':'Enable access'}</button>
        <button disabled={busy} className="account-danger" onClick={()=>setDeleting(user.id)}>Delete user</button>
       </>}
      </div>
      {deleting===user.id&&<div className="account-delete">
       <p>Delete access for {user.username}? Sign-ins will be revoked and active work stopped. Saved workspace records are archived in the database.</p>
       <button disabled={busy} className="account-danger" onClick={()=>void perform(async()=>{await accountApi(`/admin/users/${user.id}`,'DELETE');setDeleting(null);setMessage('User access deleted.');await refresh();})}>Confirm delete user</button>
       <button disabled={busy} onClick={()=>setDeleting(null)}>Keep user</button>
      </div>}
     </td>
    </tr>)}</tbody>
   </table></div>
  </div>
 </section>;
}
