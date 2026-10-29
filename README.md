# Roadword

The English of your drive test, in your language.

Roadword teaches the exact phrases a California driving examiner says during the behind-the-wheel test. Learners pick their own language, hear each command in a natural examiner voice, and practice doing the right action until it is automatic. A 3D drive test gives commands in English only, like the real test.

## Features

- Built around one loop: **hear the English, then do the action**, so learners stop translating in their head
- Real-sounding examiner voices: 2 women and 2 men (Kokoro, Apache 2.0), rotated so learners get used to different people
- 68 examiner lines, including different ways examiners say the same thing ("Take the next left", "Make a left turn here")
- Every phrase shows how it sounds, spelled for the learner's language, plus its meaning
- 14 interface languages: Español, 简体中文, 繁體中文, Tiếng Việt, 한국어, Tagalog, Русский, Հայերեն, ਪੰਜਾਬੀ, हिन्दी, العربية, فارسی, Português, English (right-to-left for Arabic and Farsi)
- Lessons: learn the phrase, then hear it with the text hidden and tap the action
- Quick reaction drill: random commands, random voices, 5 seconds to react
- 3D drive test: pre-drive check, then signals, steering, brake, gear and blind-spot checks on a real-looking route with U.S. stop and speed-limit signs; scored like the DMV sheet (15 errors max, no critical errors)
- Results show each missed command with its English, how it sounds, and its meaning
- Test-day checklist based on the DMV driving test guide (DL 955)
- Voice speed: slow, normal, fast, plus a slow replay on every phrase
- Works offline after the first visit and installs to the home screen
- No account, no tracking; progress stays on the device

## Regenerating the voices

Audio lives in `audio/<voice>/<phraseId>.mp3` (voices `w1`, `w2`, `m1`, `m2`). To add or change a line, edit `i18n/en.json` and run `tools/genvoices.py` (needs `pip install kokoro-onnx soundfile` and the Kokoro model files from github.com/thewh1teagle/kokoro-onnx releases).

## Run locally

Any static server works:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repo, go to Settings › Pages, choose "Deploy from a branch", branch `main`, folder `/ (root)`.
3. The app will be live at `https://<username>.github.io/<repo>/`.

Speaking practice needs HTTPS (GitHub Pages provides it) and works in Safari and Chrome.

## Project structure

```
index.html            App entry
manifest.webmanifest  Install settings
sw.js                 Offline cache
css/app.css           All styles and theme tokens
js/app.js             Screens, routing, lesson flow
js/content.js         Stages, phrases, languages
js/engine.js          Lesson, drill, and practice builder
js/drive.js           3D drive test
js/speech.js          Voice playback, recognition, scoring
js/visuals.js         Road scenes and icons
js/store.js           On-device progress
js/i18n.js            Language loading
js/legal.js           Terms and Privacy
i18n/*.json           Interface text, meanings, and how each phrase sounds
audio/                Examiner voice files
icons/                App icons and share image
```

## Adding a language

1. Copy `i18n/en.json` to `i18n/<code>.json` and translate every value. Keep `{placeholders}` and the brand name as they are.
2. Add the language to `LANGUAGES` in `js/content.js` (and a font in `SCRIPT_FONTS` if the script needs one).
3. Add the code to `LANGS` in `sw.js` and bump `VERSION`.

## Before launch

- Replace `[CONTACT EMAIL]` in `js/legal.js`.
- Have a native speaker review each translation.
- Phrases are based on the California DMV examiner phrase sheet (DL 80). Roadword is not affiliated with the California DMV.

© 2026 Patron LLC. All rights reserved.
