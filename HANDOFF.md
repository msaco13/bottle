# Message in a bottle: handoff

Write a note, get one link, text it to someone. They tap it and a bottle washes up on a beach at dusk with the note inside.

Live: https://msaco13.github.io/bottle/ (the page with no message is the writing page).

Last updated: 2026-11-12. Published. Not yet opened on a real phone by anyone.

## How it works

- One static page. No server, no accounts, no storage.
- The message lives in the link after the `#`: `1.` plus base64url of the UTF-8 JSON `[message, name]`. The part after `#` is never sent to the host. Limits: 600 characters, name 40. Longest possible link is about 840 characters; a typical one is under 150.
- `index.html` with a message in the link shows the shore. Without one it shows the writing page.

## The story, and what the person does

1. "Touch the water": one tap. This is also the tap that asks iPhone for motion access and starts sound.
2. A bottle rides in on the waves. "Drag the bottle up onto the dry sand." The sea never carries it there by itself.
3. It lifts into view and turns with the phone. "Shake it, or pull the cork up."
4. "Tip it upside down, or pull the note up and out."
5. The note unrolls with the message in a handwritten face.

Every step works by touch alone. Tilt and shake are extra. If someone hesitates for 5 seconds a ghost finger shows the move. After 16 seconds without progress a "Skip to the note" link appears.

## Safety nets

- No 3D on the device (or the shaders fail to compile): the note is shown straight away.
- A file fails to load, or nothing has started after 10 seconds: a small script in the page itself, separate from the app, shows the note as plain text and says to reload.
- Slow phone: the picture gets less sharp, never slower (the beach is already drawn at 72 percent size behind a full-sharpness bottle).

## Files

```
index.html        both faces of the page, and the safety-net script
css/style.css
js/code.js        the link format (pure, tested)
js/scene.js       the shoreline shader, the glass, cork and note, the camera
js/story.js       the story as a state machine (pure, tested)
js/audio.js       surf and effects, synthesised
js/main.js        wiring: touch, tilt, shake, the letter, the writing page
og.jpg            the picture chat apps show for the link
dev-server.mjs    local server for building. Not part of the published page.
test/             code.test.mjs, story.test.mjs
```

Run locally: `npm start` then http://localhost:8899. Add `?dev` for a console handle (`dev.run(seconds)`, `dev.shot(name)`), `?nogl` to pretend there is no 3D, and `/broken.html` to pretend a file failed to load. `npm test` runs both suites.

## Publishing

GitHub Pages, from the `main` branch of the public repo `msaco13/bottle`. To update: commit and `git push`. Pages rebuilds in about a minute. Commits here use the GitHub no-reply address on purpose, because the repo is public.

## Tested, and how

- Link format: unicode, emoji, 600 characters, junk, percent-escaped, wrapped with a line break.
- Story, headless: touch only, and tilt plus shake. The sea never lands the bottle on dry sand. The cork comes out with less pull than there is room above it.
- Real browser on this PC (Chromium, AMD Radeon built-in graphics) at 390 x 844 with real mouse clicks and drags: the whole story end to end, the writing page, the fallbacks.
- Frame cost with the bottle held: about 4 ms on this PC.

## Not tested (say this out loud)

- No real phone at all. No iPhone Safari, no Android Chrome.
- The iPhone motion permission tap, tilt direction on either platform, shake strength.
- In-app browsers (Messages preview, WhatsApp, Instagram, Facebook).
- Load time on cellular. Page weight is about 72 KB before compression, with no images or fonts to fetch.
- Sound. It runs without errors; nobody has listened to it.
- Handwriting face on phones. It uses fonts already on the phone (Bradley Hand on iPhone, Dancing Script on Android), not a downloaded one.

## Known gaps

- Nothing reports back. If it fails on someone's phone, nobody is told. The safety nets make sure the words still arrive.
- Plain SMS (green bubble, no data) can split a very long link. Keep long notes for iMessage, WhatsApp or similar.
- Anyone who has the link can read the note.
- If the repo or the Pages site is removed, every link stops working.
