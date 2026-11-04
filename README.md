# Mentor

A Pi-backed tutor agent for one student, used from an Android app.

- `server/` - Node service that embeds the Pi agent SDK, exposes chat over HTTP
  and SSE, and stores provider/model config.
- `web/` - Vue 3 chat UI. Built into the Android app bundle.
- `docs/SPEC.md` - architecture and API.

## Run the server

```bash
cd server
npm install
npm run dev
```

On first run it prints the URL and an access token, and stores them in
`~/.mentor/config.json`. Enter both in the app.

Add a model provider in the app's Settings screen (OpenRouter, Kilo Gateway free
models, a built-in provider key, or any custom OpenAI-compatible endpoint). Then
create a chat and start asking. `EXA_API_KEY` upgrades web search from the
keyless fallback to Exa.

## Build the app

```bash
cd web
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands in `web/android/app/build/outputs/apk/debug/app-debug.apk`.
