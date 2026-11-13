# Message in a bottle: handoff

Write a note, get one link, text it to someone. They tap it and a bottle washes up on a beach with the note inside. They can send one back in one tap. A phone can light a lantern to be told when a bottle arrives.

Live: https://msaco13.github.io/bottle/ (the page with no message is the writing page). Stats: https://msaco13.github.io/bottle/stats.html

Last updated: 2026-11-13, afternoon. Published, "Your shore" included (merged 12:07 pm Miami, live version `376ed2fde5`, checked byte for byte against `main`). Its server function `bottle_reach` was applied to the Bottle database the same afternoon and passes `test/live.test.mjs`. Michael has an Android, no iPhone. On 2026-11-13 he cleared the assistant to merge this repository's pull requests and to change the Bottle database without asking each time; staying at $0 and touching no other Supabase project still hold.

Keepsakes on a real phone, 2026-11-13: Michael's Android (Adreno 750) drew the 3D beach with keepsakes at 65 pictures a second, and the twelve-shell night shore at 71, both at full sharpness (his screenshots, and the counter).

What the counter showed on 2026-11-13 (read from `event_stats`, not watched by a person): at 6:51 am Miami an "iPhone iOS 18.7 · Safari 27" drew the 3D beach on "Apple GPU" at 57 pictures a second, granted motion, popped the cork by tilt, read the note and took its seat. An Android (Adreno 750) also drew 3D. Chrome dressed as an iPhone does not report "Apple GPU", so these are taken to be real phones. That is the first sign the 3D shaders run on Apple's driver.

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

## Your shore: people, and sending without texting

What turns it from a link maker into something you open to send. No accounts, no phone numbers on the server, nothing paid.

- **A phone with conversations opens on "Your shore"**: one row per person, a waiting bottle first. Tap a name to write to them. "Read last" opens the last bottle. "A bottle for someone new" is the old desk. A phone with no conversations sees the old desk, unchanged.
- **The first bottle to someone still goes by link.** That is what joins the two phones (the seat). If a mobile number was given, one button opens the phone's own Messages already addressed and written (`sms:` link; an iPhone wants `&body=`, Android `?body=`). The phone sends the text. Nothing here can send one, and never will at $0. On Android Chrome a "Contacts" button fills the name and number from the phone's own contact picker.
- **After that, if their lantern is lit, there is no link to text.** The button says "Send to Jorge". The note is saved to the conversation, the sender tells their lantern, and the page says "Sent to Jorge" only once the push service has really taken it. The link is still one tap away ("Text the link as well").
- **Every fallback ends in the link**, which never needs the server: lantern silent ("It is on Jorge's shore, but the lantern did not answer... To be sure, text the link"), server down, no lantern.
- **How the page knows a lantern is lit**: `bottle_reach` (`ops/sql/bottle_reach.sql`, applied) tells a member two counts: how many other phones have joined, how many of those have a lantern. A stranger is told zeros. If the server cannot answer, the page asks once per visit and then learns from each send instead (the sender already answers how many phones it told).
- The number is kept with the person in this phone's list, which is scrambled before its copy goes to the server, like the names. What is known of each lantern (`bottle-reach`) stays on the phone.
- Android: "Put Bottle on your home screen" appears on the shore when Chrome offers to install it.
- Sending results are counted under "Lantern (notifications)" on the stats page, as "sending: went straight to their lit lantern" and so on.
- Tested with `test/app.browser.mjs` (43 checks, Chromium, the server played by the script): new phone, lit lantern, silent lantern, server down, a server without `bottle_reach`, a waiting bottle, an iPhone's text link, one bottle for three people.
- **Not tested**: any real phone. Whether `sms:` opens Messages with the words in place on a real iPhone and Android. The contact picker. The install offer. And everything about iPhone lanterns, as before: direct sending to an iPhone depends on it.
- **One bottle for several people** ("One bottle for several people" on the shore, when it has two or more): tick up to eight names, write one note, and each gets their own bottle in their own conversation with its own seat. It goes straight to anyone whose lantern is lit. Each of the others gets one button that texts or shares their own link. A group text cannot carry it: one link has one seat.

## Keepsakes: a shore that remembers

The reason to come back. Every bottle sent back and forth leaves something on that conversation's beach.

- One shell on the sand for every bottle between the two people, up to 12. Every fifth is a starfish. One star lit for every bottle, up to 10. At ten the stars are joined into a figure with a name of its own ("The Quiet Oar").
- `js/keeps.js` (pure, tested). Where each shell lies, the shape of the stars and the name are worked out from the conversation's key, which both phones already hold. So both people see the same shore, nothing new is stored, and nothing new is sent. The server learns nothing. The link format did not change.
- How many: the number of notes this phone knows of (`kept`, then the server's list once the seat is taken). It only grows while the page is open. New ones fade in one after another.
- A stranger with a forwarded link knows of one note: one shell, one star, and no line of words. A link from before conversations (no key) gets one shell from the note itself.
- Under the note: "4 shells on this shore, one for every bottle between you. 6 more bottles and your stars join up." On the "bottle is ready" screen for a reply: "It is bottle 5 between you, and it leaves a starfish on the shore you share."
- Drawn twice, like everything else: in the beach shader (`#ifdef KEEPS` in `js/scene.js`) and on the flat beach (`js/flat.js`). Shells lie in a narrow band of sand above the tide and above the line of words (z 1.02 to 1.23).
- **The 3D beach is never lost for a shell.** The beach shader is built with keepsakes only if the graphics chip has room (96 uniform slots), and if that build fails the plain beach shader is built instead. The drawing report then says "no keepsakes", so the stats page shows which phones did not get them.
- Known limit: after 12 bottles the sand stops gaining shells, and after 10 the sky stops gaining stars. The line of words still counts.

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
- Everything goes through functions. Open to the page: `bottle_reach`, `bottle_open`, `bottle_list`, `bottle_add`, `shore_get`, `shore_put`, `handoff_put`, `handoff_take`, `push_save`, `push_drop`, `push_key`, `alerts_set`, `log_event`, `event_stats`, and the two old ones `thread_bottles` and `add_bottle` (old open conversations only). Only the notification sender may call `vapid_init`, `push_plan`, `push_self`, `push_gone`, `watch_plan`.
- Brakes: 400 notes per conversation, one a second per conversation, 300 a minute overall, 600 counter events a minute.
- The address, publishable key and public notification key are in `js/thread.js`. All three are meant to be public. No secret is in the repo.
- Every hour the database itself calls the sender (`pg_cron` job `bottle-watch`). That checks for problems (see "The alarm") and keeps the project from sitting idle. **Not proven**: whether that inside-out call counts as activity to Supabase's one-week pause. If the project does pause, Supabase emails first, Restore is one button, and nothing is lost. While paused: bottles open, replies send, the history each phone has already seen is still shown, and new notifications do not go out.

## The counter and the alarm

- `js/count.js` sends small events: story steps, `made`, `share`, `copy`, `motion`, `seal`, `lantern`, `carried`, `followed`, and failures (`f_plain`, `f_nogl`, `f_error`, `f_ctx`, `f_save`). Each is a kind, a short detail, a device family and the app version. Never a note, name, key or link.
- The stats page shows it in plain language. Building locally counts nothing (add `?count`). `?dev` marks a visit as a test.
- **Nothing is counted until a person really touches the page.** Link previews, browsers warming a page up, and robots load the page and never touch it. A page put away untouched is recorded once as `preview` and never counts as a visit or a problem. The safety-net script in the page follows the same rule.
- **The alarm**: on the stats page, "Tell my lantern when something breaks". If phones report 3 or more problems in a day, that phone's lantern is told, at most twice a day. It needs a lantern lit on that phone first. Not yet switched on by anyone.
- `npm run watch` checks the live page, an old link, the database and the last day's problems. `ops/watch.yml` would run it on GitHub twice a day and email on failure. Still not switched on: it needs `gh auth refresh -h github.com -s workflow`, then copy the file to `.github/workflows/`.

## How the shore gets drawn: 3D first, a flat one as the safety net

Every phone is meant to get the full 3D beach. The flat beach is only for a phone that will not give 3D.

- `js/scene.js` asks for a 3D surface five ways, best first, and treats a surface that arrives already dead as a refusal.
- If 3D is refused, the story starts on the flat beach (`js/flat.js`) and the page keeps asking for 3D for about 16 seconds, and again whenever the page comes back to the front. When 3D is granted the story moves over to it mid-step.
- If the phone takes 3D away mid-story (Safari does this when memory is short or the page is put aside), the story carries on flat and asks for 3D again. It no longer reloads.
- The flat beach uses the same camera, sea line and bottle position, so every drag, pull and pop is the same. It is plain canvas drawing: no images, nothing to download.
- `#gl` in the page is now only the touch layer. The picture is drawn on a canvas placed under it, a fresh one for each try.
- iPhone-specific care: the beach is drawn into an RGBA texture (RGB is not guaranteed on phones); every shader runs at full precision (reduced precision can be a true 16-bit number on an iPhone and one sum overflowed); shaders fall back to half precision on a phone that has no full precision; sharpness is not thrown away on a phone holding a steady 30 pictures a second (iPhone Low Power Mode).
- Each visit reports once how it was drawn (`view`): "3D beach | WebGL 1, smooth edges | Apple GPU | size", or "2D beach | 3D refused: why | on screen or not | does the browser know 3D at all". The stats page lists these by phone. **That table is how to learn whether real iPhones are getting 3D.**

### The two "WebGL is not available" reports of 2026-11-12

Two visits, about 10:00 and 10:11 pm Miami time, both from "iPhone iOS 18.7 · Safari 26", both to the writing page. What is known:
- They were not iMessage link previews. Apple's preview fetcher does not run page scripts and calls itself an old Mac Safari with "facebookexternalhit" in its name. These visits ran the page and called themselves Safari 26 on an iPhone.
- "18.7" is what Safari on iOS 26.2 and later reports. So this was a current iPhone.
- The page asked for 3D once and was told no. Known causes on a real iPhone: Lockdown Mode (it switches WebGL off), or Safari refusing or dropping a surface when the graphics chip is busy or short of memory (reported by other sites on Safari 26.1 and 26.2). Which one it was cannot be told from the record.
- Since then the page asks several ways and keeps asking, shows the flat beach meanwhile, and records enough to tell the two causes apart next time.

## The story, and what the person does

1. "Touch the water": one tap. Also the tap that asks iPhone for motion access and starts sound.
2. A bottle rides in. "Drag the bottle up onto the dry sand."
3. It lifts into view. "Shake it, or pull the cork up." The cork comes out with a spray of drops.
4. "Tip it upside down, or pull the note up and out."
5. The note unrolls in a handwritten face, with a wax seal of the sender's initial.

Every step works by touch alone. A ghost finger shows the move after 5 seconds. "Skip to the note" appears after 16. Three skies: dusk, a moonlit night with glowing surf and the odd shooting star, and dawn.

## Safety nets

- No 3D: the story plays on the flat beach, and 3D is asked for again.
- No drawing surface of any kind: the note is shown straight away.
- The app file arrives but cannot run (a very old browser): the plain note shows about a second after the page has loaded.
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
js/keeps.js       what a conversation leaves on its shore: shells, stars, the figure's name (pure, tested)
js/scene.js       the 3D shore: shaders, skies, glass, cork and note, the lantern, the camera
js/flat.js        the same shore painted flat, for a phone that will not give 3D
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
test/             code, keeps, story, flat, thread, push (npm test); live, watch and app.browser (by hand)
ops/sql/          server functions added since the first build, kept here so the database can be rebuilt
```

Run locally: `npm start`. Add `?dev` for a console handle (`dev.run(seconds)`, `dev.hold = true`, `dev.story`, `dev.scene`). With `?dev`: `&lantern=home|can|lit|safari|blocked` shows each lantern state, `&standalone` pretends to be the Home Screen app, `&flat` forces the flat beach, `&keeps=12` shows the shore of a 12-bottle conversation, `&nokeeps` builds the 3D beach without shells or stars, `&nocanvas` pretends nothing can be drawn at all. `dev.lose()` takes the 3D away mid-story.

## Publishing

`npm test`, commit, `git push`. GitHub Pages serves `main` and rebuilds in about a minute. Commits use the GitHub no-reply address because the repo is public. Write patches with files, not shell one-liners: the shell eats backslashes.

## Tested, and how

One machine: a Windows PC on the home network.

- Chromium inside the Claude app, 390 x 844, real clicks and drags, on the live site after the last publish: a first-version link end to end; a conversation link from before seals still showing its conversation.
- **A real Chrome window, on the live site**: lit the lantern with a real click, the first notification arrived and Chrome agreed to show it; a second "phone" opened the bottle, took its seat and replied; that notification arrived, named, and following it opened the reply.
- The real database (`test/live.test.mjs`, run again 2026-11-13 from a cloud machine with `NODE_USE_ENV_PROXY=1`): a member is told who has joined and whose lantern is lit, and a stranger is told nothing; a stranger with a forwarded link sees nothing and can add nothing, by the new door or the old; replies are sealed too; old conversations still open; the parcel opens once; tables and private functions are locked.
- Web Push: what the sender scrambles, a browser's side of the standard opens (`test/push.test.mjs`), and real Chrome accepted it.
- In simulation only: the iPhone card, the parcel carrying a shore into an empty copy, the stranger's view of a taken bottle.
- **The iPhone suite** (real Chrome made up as an iPhone 15: its name, screen, touch; run against the live site): a healthy iPhone gets 3D and the whole story by touch; 3D refused twice then granted; 3D never available (as in Lockdown Mode) plays the whole story flat; 3D handed over dead; 3D taken away mid-story and given back; a phone that cannot draw into a texture; a phone with half precision only; a phone held at 30 a second keeps its sharpness; a link preview counts as nothing; a person counts. All ten pass.

- Keepsakes (2026-11-13, a cloud Linux machine, Chromium with a software graphics chip, local files, server calls blocked): `test/keeps.test.mjs` checks 300 shores (same on both phones, only ever gaining, every shell on screen above the line of words, none on another). Looked at by eye in 3D and flat, under all three skies, upright and wide, at 3, 4, 7 and 12 bottles, and with `&nokeeps`. After publishing, the live site in the same Chromium: a first-version link opened with one shell and no line of words, and a conversation link built the beach with keepsakes.

## Not tested (say this out loud)

- **Keepsakes on any real phone.** The longer beach shader has only been built by Chromium's software chip. Whether Apple's and Qualcomm's drivers build it, and what it costs in pictures a second, is unknown. If a phone refuses it, that phone gets the plain 3D beach and reports "no keepsakes".

- **No real phone has been watched by a person.** Not iPhone Safari, not Android Chrome. The counter says one of each drew the 3D beach on 2026-11-13 (see the top).
- **No WebKit engine at all.** A test build of WebKit was downloaded and Windows refused to run it (code-integrity policy). So everything iPhone is proven only in Chrome wearing an iPhone's name. Chrome and Safari read shaders with the same translator, but they hand them to different graphics drivers. Whether Apple's driver draws these shaders correctly is unproven.
- **iPhone notifications, all of it**: whether "Add to Home Screen" keeps the parcel code in the address, whether the Home Screen copy then has the conversations, whether Apple's push service accepts these messages, whether the notification shows and opens the bottle. Apple's service was never contacted.
- Android notifications on a phone (desktop Chrome uses the same service, so this is the likeliest to work).
- The share sheet, tilt and shake, sound, frame rate on phones, in-app browsers, networks that block supabase.co.

## Known gaps

- Whoever opens a bottle first gets its seat. If a link is intercepted before the right person opens it, the wrong person is in, and the right person sees "opened on another phone first".
- A phone that clears its data, or a second browser on the same phone, is a stranger to its old conversations. Each new bottle it opens seats it again.
- The note in a link can be read by anyone who has that link. That cannot change without a server holding the notes.
- Notifications stop while the Supabase project is paused.
- The alarm that leaves the building (GitHub email) still needs the `workflow` permission.

## Next ideas, not started

- A beach full of bottles for one person from many (birthdays, farewells): one "add your bottle" link for the group, one link for the person. The old open conversations (key alone lets you add) may be most of the server side. Needs no notifications.
- The daily tide: one small question on everyone's desk each day, one tap to bottle the answer to someone in "Your bottles".
- Bottles that arrive later ("wash up at sunrise"). An honest lock needs the server to hold the key, which bends promise 2 for those bottles.
- Something for conversations past 12 bottles (sea glass, a second figure in the sky).

- After the first real iPhone test: fix whatever the Home Screen path gets wrong.
- Show "the first notification arrived" in the page, from the note `sw.js` leaves.
- Gulls and wind, a torn paper edge, a glint on the glass.
