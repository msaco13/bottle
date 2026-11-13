// The notification worker for Message in a bottle. It does exactly two things: show a
// notification when one arrives, and open the right place when it is tapped.
// It does NOT cache or serve the page, on purpose: links must always load the live page.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// A small note of the last notification: when it came, what kind, and whether the phone agreed to show it.
// Never who it was from or what it said. The page reads it to know the lantern really works.
async function mark(note) {
  try {
    const c = await caches.open('bottle-kv');
    await c.put(new URL('__last', self.registration.scope).href, new Response(JSON.stringify(note)));
  } catch (err) { /* not needed for anything */ }
}

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
    const kind = d.kind || 'bottle';
    await mark({ at: Date.now(), kind: kind, shown: null });
    // Who the conversation is with is looked up here, on the phone. The server never knew.
    let who = '';
    try {
      const c = await caches.open('bottle-kv');
      const r = await c.match(new URL('__names', self.registration.scope).href);
      const map = r ? await r.json() : {};
      who = (d.t && map[d.t]) || '';
    } catch (err) { who = ''; }
    // The name comes first: a phone shows only the start of a long title, and who it is from is the part that matters.
    let title = who ? who + ' sent you a bottle' : 'A bottle washed up for you';
    let body = 'Tap to bring it in.';
    let url = d.t ? './#n.' + d.t : './';
    if (kind === 'lit') { title = 'Notifications are on'; body = 'Your lantern is lit. This is how you will hear that a bottle arrived.'; url = './'; }
    if (kind === 'watch') { title = 'The bottle needs a look'; body = d.text || 'Phones have reported problems.'; url = 'stats.html'; }
    const options = { body: body, icon: 'icon-192.png', badge: 'badge.png', tag: d.t || kind, renotify: true, data: { url: url } };
    try {
      await self.registration.showNotification(title, options);
      await mark({ at: Date.now(), kind: kind, shown: true, title: kind === 'bottle' ? (who ? 'named' : 'unnamed') : kind });
    } catch (err) {
      // Some phones refuse an option they do not know. Say it the plainest way rather than not at all.
      try { await self.registration.showNotification(title, { body: body, data: { url: url } }); await mark({ at: Date.now(), kind: kind, shown: true, plain: String(err && err.message).slice(0, 80) }); }
      catch (err2) { await mark({ at: Date.now(), kind: kind, shown: false, why: String(err2 && err2.message).slice(0, 80) }); }
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of open) {
      try { if ('navigate' in c) { const w = await c.navigate(url); if (w) { await w.focus(); return; } } } catch (err) { /* try the next, or open a new one */ }
    }
    await self.clients.openWindow(url);
  })());
});
