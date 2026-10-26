import {createClient} from '@supabase/supabase-js';
import {supabaseUrl,supabasePublishableKey} from './supabase-config';
// Single-organizer deployment. This server-only allowlist is independent of
// user-editable metadata and the legacy ChatGPT/local owner ID in D1.
export const organizerEmail = 'aizemdairo@gmail.com';
export function isOrganizer(user:any):boolean {
  return Boolean(user?.id && user.email_confirmed_at && !user.is_anonymous &&
    user.email?.toLowerCase() === organizerEmail);
}
export async function getOrganizer(req:Request){
  const header=req.headers.get('Authorization')||'';
  if(!header.startsWith('Bearer '))return null;
  const client=createClient(supabaseUrl,supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  try{
    const {data:{user},error}=await client.auth.getUser(header.slice(7));
    if(error||!isOrganizer(user))return null;
    return {userId:user!.id,email:user!.email!};
  }catch{return null;}
}
