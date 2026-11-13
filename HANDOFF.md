# Message in a bottle: handoff

Write a note, get one link, text it to someone. They tap it and a bottle washes up on a beach with the note inside. They can send one back in one tap. A phone can light a lantern to be told when a bottle arrives.

Live: https://msaco13.github.io/bottle/ (the page with no message is the writing page). Stats: https://msaco13.github.io/bottle/stats.html

Last updated: 2026-11-12. Published. The counter shows at least one real iPhone has opened it. Nobody has yet confirmed what a real phone shows.

## The promises

1. **Links already sent keep working.** The link format only grows by adding optional fields on the end. `test/code.test.mjs` holds real links from the first version (`SENT`). Never edit that list. If that test fails, do not publish. `npm run watch` also checks an old link against the live code.
2. **A bottle never needs the server.** The note is inside the link. If the server is slow, asleep or gone, bottles open and replies send.
3. **A forwarded link gives a stranger one note and nothing else.** See "Seals".
4. **The server cannot read a note, and never learns a name.** Notes are scrambled on the phone. Notifications carry only a conversation number.

## How it works

- One static page on GitHub Pages. No accounts, no sign-in, no app.
- The note lives in the link after the `#`: `1.` plus base64url of the UTF-8 JSON list `[message, name, mood, to, key, claim]`. Empty fields on the end are dropped, so a plain dusk bottle is byte for byte what version one made. Limits: 600 characters, names 40.
  - `mood`: `""` dusk, `"n"` night, `"a"` dawn. `to`: who it is for.
  - `key`: 22 characters, the secret of the conversation. `claim`: 16 characters, the one seat this bottle carries.

## Seals (privacy)

- A conversation made from now on is **sealed**: only its members can read it or add to it. The writer of the first bottle is its first member.
- Each bottle carries one seat. The first phone to open that bottle (after a person has touched the page, so a link preview cannot take it) joins the conversation. Opening it again on the same phone is fine. The writer opening their own bottle does not use the seat.
- A link forwarded on and opened by someone else later finds the seat taken. They read the one note that is in the link. They see no earlier notes and cannot add to the conversation. If they send one back, it starts a conversation of its own. The page says: "This bottle was opened on another phone first".
- If the sender opens their own link on a second device before the real person does, that device takes the seat. The real person still reads the note and can reply (a new conversation). Use "See what they will see" on the same phone to preview without using the seat.
- Conversations made before seals (`threads.sealed = false`) are left exactly as they were: the key alone opens them. That is what keeps already-sent links working.
- Proven by `node test/live.test.mjs` against the real database.

## Your shore (who a phone is, with no sign-in)

- `js/shore.js`. A phone makes a secret the first time it is needed and keeps it in its own storage. Two things are worked out from it: a token shown to the server ("this is me"), and a key that scrambles the phone's list of conversations before a copy is kept on the server.
- The server knows a shore only by the hash of its token. It cannot work the secret back out.
- The phone also keeps the notes it has already seen (`bottle-notes`), so the history is still there if the server is asleep.
- Clearing the browser's data makes a new, empty shore. Old links still open.

## The lantern (notifications)

- `js/lantern.js`, `sw.js`, `ops/notify/`. "Light a lantern, so a bottle can find you" appears under a note, on the "bottle is ready" screen, and on the desk. When it is lit a lantern glows on the sand.
- Android and computers: one tap, the browser asks, done. The first notification ("Your lantern is lit") is the proof.
- **iPhone**: Apple only delivers notifications to a page added to the Home Screen (iOS 16.4 and later). The button opens a card with the three taps. While the card is open the page's address is a one-time parcel code, so the Home Screen copy starts with the same shore and the same conversations. Then "Light the lantern" is the first thing on its desk. Inside another app's browser (Instagram and the like) the page says to open it in Safari.
- When a member adds a bottle, the page asks the sender (`notify`) to tell the other members' phones. The notification says "A bottle from Dad has washed up". The name is looked up on the receiving phone; the server never has it. Tapping it opens the newest bottle of that conversation.
- `sw.js` only shows notifications. It does not cache or serve the page.
- **Learned the hard way**: Google's push service sometimes answers "gone" (410) for a subscription that is seconds old. So the page waits a breath before the proof notification, the sender retries it for a few seconds, the page tries again quietly at 12 and 40 seconds, and a subscription under ten minutes old is never deleted on a "gone". In eight real-Chrome runs after the fix, every bottle notification arrived; one proof notification was late.
- The stats page shows every lantern result by phone ("Sharing, lanterns, seats..."). That table is where to look to learn whether iPhones are getting through: a row like "lit, first notification late (403)" from an iPhone would mean Apple is refusing the messages.
- The sender is a Supabase Edge Function, `notify`, in the Bottle project. Web Push is written by hand in `ops/notify/webpush.js` (no outside library) and tested in `test/push.test.mjs`. Its signing key was made inside the function on first run and is kept in `private.settings`, which nothing outside can read. To redeploy, deploy the two files in `ops/notify/` as they are, with JWT checking off.

## The server (Supabase)

- Project `bottle`, ref `segtizidayglyouweszn`, us-east-1, free plan, $0. It holds nothing else. Never touch the other projects in the account.
- Tables, all locked (row security on, no policies): `bottles`, `threads`, `members`, `shores`, `push_subs`, `handoffs`, `events`, and `private.settings`.
- Everything goes through functions. Open to the page: `bottle_open`, `bottle_list`, `bottle_add`, `shore_get`, `shore_put`, `handoff_put`, `handoff_take`, `push_save`, `push_drop`, `push_key`, `alerts_set`, `log_event`, `event_stats`, and the two old ones `thread_bottles` and `add_bottle` (old open conversations only). Only the notification sender may call `vapid_init`, `push_plan`, `push_self`, `push_gone`, `watch_plan`.
- Brakes: 400 notes per conversation, one a second per conversation, 300 a minute overall, 600 counter events a minute.
- The address, publishable key and public notification key are in `js/thread.js`. All three are meant to be public. No secret is in the repo.
- Every hour the database itself calls the sender (`pg_cron` job `bottle-watch`). That checks for problems (see "The alarm") and keeps the project from sitting idle. **Not proven**: whether that inside-out call counts as activity to Supabase's one-week pause. If the project does pause, Supabase emails first, Restore is one button, and nothing is lost. While paused: bottles open, replies send, the history each phone has already seen is still shown, and new notifications do not go out.

## The counter and the alarm

- `js/count.js` sends small events: story steps, `made`, `share`, `copy`, `motion`, `seal`, `lantern`, `carried`, `followed`, and failures (`f_plain`, `f_nogl`, `f_error`, `f_ctx`, `f_save`). Each is a kind, a short detail, a device family and the app version. Never a note, name, key or link.
- The stats page shows it in plain language. Building locally counts nothing (add `?count`). `?dev` marks a visit as a test.
- **The alarm**: on the stats page, "Tell my lantern when something breaks". If phones report 3 or more problems in a day, that phone's lantern is told, at most twice a day. It needs a lantern lit on that phone first. Not yet switched on by anyone.
- `npm run watch` checks the live page, an old link, the database and the last day's problems. `ops/watch.yml` would run it on GitHub twice a day and email on failure. Still not switched on: it needs `gh auth refresh -h github.com -s workflow`, then copy the file to `.github/workflows/`.

## The story, and what the person does

1. "Touch the water": one tap. Also the tap that asks iPhone for motion access and starts sound.
2. A bottle rides in. "Drag the bottle up onto the dry sand."
3. It lifts into view. "Shake it, or pull the cork up." The cork comes out with a spray of drops.
4. "Tip it upside down, or pull the note up and out."
5. The note unrolls in a handwritten face, with a wax seal of the sender's initial.

Every step works by touch alone. A ghost finger shows the move after 5 seconds. "Skip to the note" appears after 16. Three skies: dusk, a moonlit night with glowing surf and the odd shooting star, and dawn.

## Safety nets

- No 3D (asked for five ways before giving up): the note is shown straight away.
- A file fails to load, or nothing has started after 10 seconds: a small script in the page itself shows the note as plain text.
- Slow phone: the picture gets less sharp, never slower.
- No share sheet: "Copy the link" is always there.
- No server: everything above still works. Only earlier notes on a phone that never saw them, and notifications, are missing.

## Files

```
index.html        both faces of the page, and the safety-net script
app.js            BUILT. Never edit. Made from js/ by build.mjs
build.mjs         packs js/ into app.js, stamps versions and the server address
css/style.css
js/code.js        the link format (pure, tested)
js/scene.js       the shoreline shader, the skies, the glass, cork and note, the lantern, the camera
js/story.js       the story as a state machine (pure, tested)
js/audio.js       surf and effects, synthesised
js/thread.js      conversations: keys, encryption, seats, the server calls
js/shore.js       this phone's memory, its secret, the copy on the server, the parcel for the Home Screen
js/lantern.js     notifications: where the phone stands, lighting, putting out
js/count.js       the counter
js/main.js        wiring
sw.js             shows a notification, opens the right place when tapped. Nothing else.
manifest.webmanifest, manifest-app.webmanifest, icon-*.png, apple-touch-icon.png, badge.png
stats.html        the stats page
ops/notify/       the notification sender (deployed to Supabase) and its Web Push code
ops/make-icons.mjs  draws the icons
ops/watch.yml     the GitHub schedule for the watch (not switched on)
test/             code, story, thread, push (npm test); live and watch (by hand)
```

Run locally: `npm start`. Add `?dev` for a console handle (`dev.run(seconds)`, `dev.hold = true`, `dev.story`, `dev.scene`). With `?dev`: `&lantern=home|can|lit|safari|blocked` shows each lantern state, `&standalone` pretends to be the Home Screen app, `?nogl` pretends there is no 3D.

## Publishing

`npm test`, commit, `git push`. GitHub Pages serves `main` and rebuilds in about a minute. Commits use the GitHub no-reply address because the repo is public. Write patches with files, not shell one-liners: the shell eats backslashes.

## Tested, and how

One machine: a Windows PC on the home network.

- Chromium inside the Claude app, 390 x 844, real clicks and drags, on the live site after the last publish: a first-version link end to end; a conversation link from before seals still showing its conversation.
- **A real Chrome window, on the live site**: lit the lantern with a real click, the first notification arrived and Chrome agreed to show it; a second "phone" opened the bottle, took its seat and replied; that notification arrived, named, and following it opened the reply.
- The real database (`test/live.test.mjs`): a stranger with a forwarded link sees nothing and can add nothing, by the new door or the old; replies are sealed too; old conversations still open; the parcel opens once; tables and private functions are locked.
- Web Push: what the sender scrambles, a browser's side of the standard opens (`test/push.test.mjs`), and real Chrome accepted it.
- In simulation only: the iPhone card, the parcel carrying a shore into an empty copy, the stranger's view of a taken bottle.

## Not tested (say this out loud)

- **No real phone has been watched.** Not iPhone Safari, not Android Chrome.
- **iPhone notifications, all of it**: whether "Add to Home Screen" keeps the parcel code in the address, whether the Home Screen copy then has the conversations, whether Apple's push service accepts these messages, whether the notification shows and opens the bottle. Apple's service was never contacted.
- Android notifications on a phone (desktop Chrome uses the same service, so this is the likeliest to work).
- Whether a text-message link preview runs the page. The counter recorded "WebGL is not available" from an iPhone on Safari 26 on 2026-11-12 around 10 pm. That may have been a preview, Lockdown Mode, or a real failure. The page now asks for 3D five ways and reports more detail.
- The share sheet, tilt and shake, sound, frame rate on phones, in-app browsers, networks that block supabase.co.

## Known gaps

- Whoever opens a bottle first gets its seat. If a link is intercepted before the right person opens it, the wrong person is in, and the right person sees "opened on another phone first".
- A phone that clears its data, or a second browser on the same phone, is a stranger to its old conversations. Each new bottle it opens seats it again.
- The note in a link can be read by anyone who has that link. That cannot change without a server holding the notes.
- Notifications stop while the Supabase project is paused.
- The alarm that leaves the building (GitHub email) still needs the `workflow` permission.

## Next ideas, not started

- After the first real iPhone test: fix whatever the Home Screen path gets wrong.
- Show "the first notification arrived" in the page, from the note `sw.js` leaves.
- Gulls and wind, a torn paper edge, a glint on the glass.
