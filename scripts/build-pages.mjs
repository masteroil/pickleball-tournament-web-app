// Build a separate Pages distribution. Keep the standalone demo in dist/.
import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
const project = 'pickleball-live-ae709';
const base = '/pickleball-tournament-web-app/';
for (const name of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_APP_ID']) {
  if (!process.env[name]) throw new Error('Missing GitHub repository variable ' + name);
}
if (!process.env.VITE_FIREBASE_APP_ID.startsWith('1:4850000663659:web:')) throw new Error('Use the Web App ID for ' + project);
Object.assign(process.env, { VITE_FIREBASE_PROJECT_ID: project, VITE_FIREBASE_AUTH_DOMAIN: project + '.firebaseapp.com', VITE_USE_EMULATORS: 'false' });
await build({base, build:{outDir:'dist-pages',emptyOutDir:true}, plugins:[{
  name:'pages-worker-path', enforce:'pre',
  transform(source,id) {
    if(id.endsWith('/src/main.tsx')) return source.replace('register("/sw.js")','register(import.meta.env.BASE_URL + "sw.js")');
  }
}]});
const manifestPath='dist-pages/manifest.webmanifest';
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
manifest.start_url='./';manifest.scope='./';
manifest.icons.forEach(icon=>{icon.src=icon.src.replace(/^\//,'./')});
await writeFile(manifestPath,JSON.stringify(manifest));
await writeFile('dist-pages/sw.js',`
const root = new URL('./', self.location.href).href;
const cacheName = 'pickleball-pages-' + new URL(root).pathname;
self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache = await caches.open(cacheName);
  const response = await fetch(root,{cache:'reload'});
  if (!response.ok) throw Error('Unable to fetch app shell');
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>new URL(m[1],root).href).filter(url=>url.startsWith(root+'assets/'));
  await cache.addAll(assets); await cache.put(root,response); await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!event.request.url.startsWith(root))return;
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match(root)));
  else if(event.request.url.startsWith(root+'assets/'))event.respondWith(caches.match(event.request).then(c=>c||fetch(event.request)));
});
`);
