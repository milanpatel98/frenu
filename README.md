# Roadword

The English of your drive test, in your language.

Roadword teaches the exact phrases a California driving examiner says during the behind-the-wheel test. Learners pick their own language, then listen, tap, build, and speak each command until it sounds familiar. A mock exam plays commands in English only, like the real test.

## Features

- 14 interface languages: Español, 简体中文, 繁體中文, Tiếng Việt, 한국어, Tagalog, Русский, Հայերեն, ਪੰਜਾਬੀ, हिन्दी, العربية, فارسی, Português, English (right-to-left for Arabic and Farsi)
- 52 examiner phrases in 6 stages, plus a 20-command mock exam
- Five exercise types: listen, act (tap the maneuver), build the sentence, speak, match pairs
- English voice at slow, normal, or fast speed, plus a slow replay on every phrase
- Speaking practice with word-by-word scoring (Web Speech API)
- Animated top-down road scenes for every maneuver
- Mistakes come back at the end of each lesson
- XP, daily streak, exam readiness, weak-phrase practice, phrase book with search
- Works offline after the first visit and installs to the home screen
- No account, no tracking; progress stays on the device
- Light and dark themes, reduced-motion support, screen-reader labels

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
js/engine.js          Lesson, practice, and exam builder
js/speech.js          Voice playback, recognition, scoring
js/visuals.js         Road scenes and icons
js/store.js           On-device progress
js/i18n.js            Language loading
js/legal.js           Terms and Privacy
i18n/*.json           Interface text and phrase translations
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
