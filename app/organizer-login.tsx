'use client';
import {useEffect,useState} from 'react';
import {supabase} from './supabase-client';
export default function OrganizerLogin({onChange}:{onChange:()=>void}){
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[signedIn,setSignedIn]=useState(false),[open,setOpen]=useState(false),[mode,setMode]=useState<'login'|'signup'|'reset'|'update'>('login'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    const {data:{subscription}}=supabase().auth.onAuthStateChange((event,session)=>{
      setSignedIn(!!session);
      if(event==='PASSWORD_RECOVERY'){setMode('update');setOpen(true)}
      // Do not await another auth method inside the auth callback.
      setTimeout(onChange,0);
    });
    return()=>subscription.unsubscribe();
  },[]);
  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const auth=supabase().auth;
      const result=mode==='signup'?await auth.signUp({email:email.trim(),password,options:{emailRedirectTo:location.origin+'/'}}):
        mode==='reset'?await auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+'/'}):
        mode==='update'?await auth.updateUser({password}):await auth.signInWithPassword({email:email.trim(),password});
      if(result.error)throw result.error;
      setPassword('');
      if(mode==='signup')setMessage('Check your inbox to confirm your email, then return here to log in. Registration does not grant organizer permissions.');
      else if(mode==='reset')setMessage('If an account exists, check your inbox for the password reset link.');
      else{setOpen(false);onChange()}
    }catch(e:any){setMessage(e.message||'Unable to sign in. Try again.')}finally{setBusy(false)}
  }
  return <><button className="secondary" onClick={async()=>{
    if(signedIn){const {error}=await supabase().auth.signOut();if(error){setMessage(error.message);setOpen(true)}else onChange()}
    else{setMode('login');setMessage('');setOpen(true)}
  }}>{signedIn?'Sign out':'Organizer login'}</button>
  {open&&<div className="modalback"><section className="modal" role="dialog" aria-modal="true" aria-label="Organizer account"><button className="close" aria-label="Close login" onClick={()=>setOpen(false)}>×</button><span className="tag">ORGANIZER ACCOUNT</span><h2>{mode==='signup'?'Create your account':mode==='reset'?'Reset password':mode==='update'?'Choose a new password':'Welcome back'}</h2><p>Use your email and password to manage Courtside.</p><form onSubmit={submit}>
  {mode!=='update'&&<label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>}
  {mode!=='reset'&&<label>Password<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={mode==='login'?1:8} required/></label>}
  <button className="primary full" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='reset'?'Send reset link':mode==='update'?'Save password':'Log in'}</button></form>
  {message&&<p role="status">{message}</p>}
  {mode==='login'&&<div className="authlinks"><button className="textbutton" onClick={()=>{setMode('signup');setMessage('')}}>Create account</button><button className="textbutton" onClick={()=>{setMode('reset');setMessage('')}}>Forgot password?</button></div>}
  {(mode==='signup'||mode==='reset')&&<button className="textbutton" onClick={()=>{setMode('login');setMessage('')}}>Back to login</button>}
  </section></div>}</>;
}
