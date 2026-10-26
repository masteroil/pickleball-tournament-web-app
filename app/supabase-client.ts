'use client';
import {createClient} from '@supabase/supabase-js';
import {supabaseUrl,supabasePublishableKey} from './supabase-config';
let client: ReturnType<typeof createClient> | undefined;
export function supabase(){return client ??= createClient(supabaseUrl,supabasePublishableKey);}
export async function authHeaders():Promise<Record<string,string>> {
  const {data:{session}}=await supabase().auth.getSession();
  return session?{Authorization:`Bearer ${session.access_token}`} : {};
}
