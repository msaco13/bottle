# Message in a bottle: handoff

Write a note, get one link, text it to someone. They tap it and a bottle washes up on a beach with the note inside. They can send one back in one tap, and it goes back and forth from there.

Live: https://msaco13.github.io/bottle/ (the page with no message is the writing page).

Last updated: 2026-11-12. Published. Not yet opened on a real phone by anyone.

## The two promises

1. **Links already sent keep working.** The link format only ever grows by adding optional fields on the end. `test/code.test.mjs` holds real links from the first published version (`SENT`). Never edit that list, only add to it. If that test fails, do not publish.
2. **A bottle never needs the server.** The note is inside the link. If the server is slow, asleep or gone, bottles still open and replies still send. Only the list of earlier notes goes missing.

## How it works

- One static page on GitHub Pages. No accounts, no sign-in, no app.
- The note lives in the link after the `#`: `1.` plus base64url of the UTF-8 JSON list `[message, name, mood, to, key]`. Empty fields on the end are dropped, so a plain dusk bottle with no reply address is byte for byte what version one made. The part after `#` is never sent to the host. Limits: 600 characters, names 40.
  - `mood`: `""` dusk, `"n"` night, `"a"` dawn.
  - `to`: who it is for. Shows as "For Dad" on the note.
  - `key`: 22 characters, the secret of the conversation this bottle belongs to.
- `index.html` with a note in the link shows the shore. Without one it shows the writing desk.

## Back and forth

- After reading, the button says "Send one back to Mike". One tap opens the desk already addressed. "Create bottle" opens the phone's share sheet in the same tap, with the link ready to text.
- Every bottle carries a conversation key. A reply reuses the key of the bottle it answers. A reply to an old keyless link starts a new conversation.
- When a bottle is made, a scrambled copy is also saved to the conversation on the server. So:
  - Opening any link in a conversation shows a "Read the new bottle from Dad" button if something newer has arrived, plus a row of chips for every note in it.
  - The first page lists "Your bottles": each conversation this phone has been part of. A reply that has not been read yet sits at the top of the page. One tap and that bottle washes up.
- There are no notifications. The text message with the link is still how people find out. The list is a second way back in, not a replacement.
- The phone remembers three things in its own storage and nowhere else: your name, your conversation keys (`bottle-threads`, newest 12), and the ids of notes you wrote (`bottle-mine`). Clear the browser data and the list is empty, but every link still works.

## The server (Supabase)

- Project `bottle`, ref `segtizidayglyouweszn`, us-east-1, free plan, $0. It is a new project that holds nothing else. Never touch the other projects in the account.
- One table, `public.bottles(id, thread, body, created_at)`. Row security is on with no policies, so the table cannot be read or written directly. Two functions do everything: `thread_bottles(p_thread)` and `add_bottle(p_thread, p_body)`.
- What the server stores is unreadable: the conversation number is a hash of the key, and the note is AES-GCM encrypted on the phone with a key derived from the same secret. The secret only travels inside links, after the `#`.
- Brakes in `add_bottle`: 400 notes per conversation, one per second per conversation, 300 a minute overall.
- The address and publishable key are in `js/thread.js`. That key is meant to be public. No secret key is in the repo.
- `node test/live.test.mjs` checks the real database by hand (round trip, isolation, brakes, locked table). It leaves a few test rows. There are also a handful of test rows from building this. They are scrambled and harmless.
- **Free projects pause after about a week with no activity.** Supabase emails the owner first. Restoring is one button in the Supabase dashboard. While paused, bottles open and replies send as normal; the earlier-notes row and "Your bottles" are simply absent.

## The story, and what the person does

1. "Touch the water": one tap. This is also the tap that asks iPhone for motion access and starts sound.
2. A bottle rides in on the waves. "Drag the bottle up onto the dry sand." The sea never carries it there by itself.
3. It lifts into view and turns with the phone. "Shake it, or pull the cork up."
4. "Tip it upside down, or pull the note up and out."
5. The note unrolls in a handwritten face, with a wax seal of the sender's initial.

Every step works by touch alone. Tilt and shake are extra. If someone hesitates for 5 seconds a ghost finger shows the move. After 16 seconds without progress a "Skip to the note" link appears. The view follows small tilts of the phone.

Three skies, picked by the sender on the desk: dusk, a moonlit night with glowing surf, and dawn. The desk shows the chosen sky behind the form.

## Safety nets

- No 3D on the device, or the shaders fail to compile: the note is shown straight away.
- A file fails to load, or nothing has started after 10 seconds: a small script in the page itself, separate from the app, shows the note as plain text and says to reload.
- Slow phone: the picture gets less sharp, never slower.
- No share sheet (desktop, some in-app browsers): "Copy the link" is always there.

## Files

```
index.html        both faces of the page, and the safety-net script
app.js            BUILT. Never edit. Made from js/ by build.mjs
build.mjs         packs js/ into app.js and stamps index.html with a version
css/style.css
js/code.js        the link format (pure, tested)
js/scene.js       the shoreline shader, the three skies, the glass, cork and note, the camera
js/story.js       the story as a state machine (pure, tested)
js/audio.js       surf and effects, synthesised
js/thread.js      conversations: keys, encryption, the two server calls
js/main.js        wiring: touch, tilt, shake, the letter, the desk, "Your bottles"
og.jpg            the picture chat apps show for the link
dev-server.mjs    local server for building. Not part of the published page.
test/             code, story, thread (run by npm test), live (by hand)
```

Run locally: `npm start`, then the address it prints. Add `?dev` for a console handle (`dev.run(seconds)`, `dev.shot(name)`, `dev.story`, `dev.scene`), `?nogl` to pretend there is no 3D, and `/broken.html` to pretend a file failed to load.

## Publishing

`npm test` (it builds first), commit, `git push`. GitHub Pages serves the `main` branch of the public repo `msaco13/bottle` and rebuilds in about a minute. The page loads `app.js?v=<hash>`, so a phone never mixes an old file with a new one. Commits use the GitHub no-reply address on purpose, because the repo is public.

## Tested, and how

All of this was on one machine: Chromium on a Windows PC (AMD Radeon built-in graphics), home network, window set to 390 x 844, real mouse clicks and drags. Both the local copy and the live site.

- Old links from version one: decode test, and one opened end to end on the live site after every publish today.
- The story under each of the three skies.
- Reply round trip on the live site against the real database: a note, a reply from the other person, the first link then shows "Read the new bottle", and the first page shows it under "Your bottles".
- Two people with the same name in one conversation.
- Crypto: round trip, wrong key, tampering. A dead server does not hang the page.
- The database: direct table access refused, the brakes work.

## Not tested (say this out loud)

- No real phone at all. No iPhone Safari, no Android Chrome.
- The share sheet. Desktop Chromium does not have one, so the one-tap share has never been seen working.
- The iPhone motion permission tap, tilt direction, shake strength, the look-around camera on a real phone.
- The new sky shaders on a phone graphics chip. If one refuses them, that phone gets the note with no beach.
- In-app browsers (Messages preview, WhatsApp, Instagram, Facebook).
- A network that blocks supabase.co (some schools and offices). Expected result: bottles work, no earlier-notes row.
- Load time on cellular. Page weight is about 80 KB before compression, with no images or fonts to fetch.
- Sound. It runs without errors; nobody has listened to it.

## Known gaps

- Nothing reports back. If it fails on someone's phone, or the server pauses, nobody is told (apart from Supabase's own email).
- No notifications. A reply is found by the text that carries its link, or by opening the page again.
- Anyone who has a link can read that whole conversation and add to it under any name. That is the price of no sign-in.
- Plain SMS (green bubble, no data) can split a very long link.
- If the repo or the Pages site is removed, every link stops working.

## Next ideas, not started

- A tiny "something went wrong" counter in the Bottle database, so failures on phones are visible.
- Water drops and a glint on the glass, a torn paper edge, gulls and wind in the sound.
- Crickets or a quieter surf at night.
