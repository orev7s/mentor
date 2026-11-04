# Mentor

A Pi-backed tutor agent for one student, used from an Android app.

- `server/` - Node service that embeds the Pi agent SDK, exposes chat over HTTP
  and SSE, and stores provider/model config.
- `web/` - React 19 UI built with Vite, Tailwind 4, shadcn and the chatcn agent
  components. Built into the Android app bundle.
- `docs/SPEC.md` - architecture and API.
- `docs/UPDATES.md` - silent web updates from GitHub releases.
- `docs/screenshots/` - the current screens from `npm run ui-test`.

## What the student sees

The chat surface is deliberately plain, closer to ChatGPT than to a coding
agent. There is no top bar and no tab strip: the thread fills the screen, the
composer sits at the bottom, and three floating buttons do the rest. One opens
the chat list, one starts a new chat, and the overflow menu holds Files,
Changes, Terminal, the model picker and settings. Files, changes and terminal
open as a sheet over the chat, only when the student asks for them.

- streaming Markdown (code, tables, math), reasoning, and every tool call
- a pinned todo list the agent writes with `todo_write`, plus the same plan in
  the thread
- a Terminal sheet fed by every `bash` command, live output and exit code
- a Changes sheet with diffs for `write`/`edit`
- a Files sheet listing uploads and generated PDFs, notes, worksheets and
  scripts, with preview and download
- `ask_student` cards: one or more multiple-choice questions the agent asks and
  waits on. The student picks answers, sends them, and the agent continues in
  the same run. Use it when the student asks to be quizzed or when the agent
  needs a decision before it starts
- attachments in the composer (PDF, DOCX, images, text) that the agent reads with
  `read_document`/`ocr_image`
- at the end of every run, a card listing the files that run created or changed,
  each with its own download button
- `share_file` cards, where the agent points at one deliverable and offers it
- a download notice at the top of the screen that says it started, then saved,
  with Open
- copy on every message, and Fork from here to branch a chat at any turn

The layout is mobile first. Tap targets grow on touch. The floating buttons and
composer clear the system bars and the keyboard through insets pushed from
`MainActivity`, which matters on Android 15 and later where apps are edge to
edge. Downloads on Android go through the system `DownloadManager`, so a PDF
saves as a PDF, not `download.bin`. A status query that fails is not treated as
a failed download: the file can be saved while the query is unavailable.

## The agent toolset

Pi's built-in tools stay enabled: `read`, `write`, `edit`, `bash`. The server
adds:

| Tool | Does |
| --- | --- |
| `todo_write` | Publishes the plan the UI pins above the composer |
| `share_file` | Hands the student one file as a download card |
| `ask_student` | Asks up to six multiple-choice questions and waits for the answers |
| `read_document` | Extracts text from PDF, DOCX, HTML, Markdown and text |
| `ocr_image` | OCRs a photo or scan with tesseract.js |
| `web_search` | Exa when `EXA_API_KEY` is set, else keyless Bing HTML |
| `web_fetch` | Fetches a page and converts it to readable text |

Every tool is scoped to the session workspace. A tutor system prompt is appended
to Pi's default prompt: teach step by step, plan with `todo_write`, cite sources,
save deliverables in the workspace so they appear in Files, and install any
missing command or library itself before telling the student a format is
unsupported.

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
create a chat and start asking.

## Build the web UI

```bash
cd web
npm install
npm run build
```

The UI is served by the agent server from `web/dist`.

## Build the app

```bash
cd web
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands at `web/android/app/build/outputs/apk/debug/app-debug.apk`.

## Ship a web update

Web changes do not need a new APK. Build a bundle and publish it as a GitHub
release; installed apps download it silently and apply it on the next launch:

```bash
cd web
npm run release:web 1.0.1
```

The updater lives in `web/src/lib/updater.ts`, defaults to `orev7s/mentor`, and
reads `VITE_UPDATE_REPO` if you want another repo. A new APK is only needed when
native code changes. `docs/UPDATES.md` has the details.

## Test the UI

With the server running and `~/.mentor-dev/config.json` present:

```bash
cd web
npm run ui-test
```

It connects, sends a prompt that plans with `todo_write`, writes a file and runs
`bash`, then captures the chat, Files, Changes, Terminal, model picker,
settings, workspace sheet, tablet, fork and phone screens into
`docs/screenshots/`. A failing run leaves `99-failure.png` behind; a passing run
removes it.

`npm run ask-test` covers `ask_student` end to end: it asks for two questions,
picks one option in each, sends the answers, and waits for the agent to finish
the same run. Its screenshots go to `/tmp/opencode`.