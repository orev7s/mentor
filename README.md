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
composer sits at the bottom, and floating buttons do the rest. The chat list
opens a sidebar with search, recent chats and a footer; the overflow menu holds
Files, Changes, the model picker and settings. There is no terminal view: bash
calls stay in the thread.

- streaming Markdown (code, tables, math), reasoning, and every tool call
- a pinned todo list the agent writes with `todo_write`, plus the same plan in
  the thread
- a working row under the thread while a run is in flight, for every model:
  "Working" with the current step and elapsed time, so instant tool calls never
  look like nothing is happening
- a Changes sheet with diffs for `write`/`edit`
- a Files sheet listing uploads and generated PDFs, notes, worksheets and
  scripts, with preview and download
- `ask_student` cards: one or more multiple-choice questions the agent asks and
  waits on. The student picks answers, sends them, and the agent continues in
  the same run. Use it when the student asks to be quizzed or when the agent
  needs a decision before it starts
- voice: a mic records a clip, the server transcribes it with Groq Whisper, and
  the text lands in the composer. Turkish, Arabic and English. Every agent reply
  has a small Read aloud icon button next to Copy and Fork that uses the Android
  system text-to-speech engine
- attachments in the composer (PDF, DOCX, images, text) that the agent reads with
  `read_document`/`ocr_image`
- at the end of every run, a card listing the files that run created or changed,
  each with its own download button
- `share_file` cards, where the agent points at one deliverable and offers it
- a download notice at the top of the screen that says it started, then saved,
  with Open, which asks which installed app should open the file
- copy on every message, Read aloud on every agent reply, and Fork from here to
  branch a chat at any turn
- the composer keeps a draft per chat, so a prompt typed before the app was
  killed is still there on the next launch
- long-term memory: the agent can save, change, forget or list facts about the
  student, but only when the student explicitly asks

When a free model runs out of quota, the server benches it and moves the chat to
another configured free model on its own, then replays the turn. The student
sees the model name change, not an error. `docs/SPEC.md` has the details.

The layout is mobile first. Tap targets grow on touch. The floating buttons and
composer clear the system bars and the keyboard through insets pushed from
`MainActivity`, which matters on Android 15 and later where apps are edge to
edge. Downloads on Android go through the system `DownloadManager`, so a PDF
saves as a PDF, not `download.bin`. Open hands the finished download to Android's
app chooser, using the content URI the manager exposes, so the student picks a PDF
reader, Files, or whatever else handles that type. A status query that fails is
not treated as a failed download: the file can be saved while the query is
unavailable.

## The agent toolset

Pi's built-in tools stay enabled: `read`, `write`, `edit`, `bash`. The server
adds:

| Tool | Does |
| --- | --- |
| `todo_write` | Publishes the plan the UI pins above the composer |
| `todo_clear` | Clears the plan once the task is finished |
| `share_file` | Hands the student one file as a download card |
| `ask_student` | Asks up to six multiple-choice questions and waits for the answers |
| `read_document` | Extracts text from PDF, DOCX, HTML, Markdown and text |
| `ocr_image` | OCRs a photo or scan with tesseract.js |
| `memory` | Saves, updates, deletes or lists facts about the student, only on request |
| `web_search` | Exa when `EXA_API_KEY` is set, else keyless Bing HTML |
| `web_fetch` | Fetches a page and converts it to readable text |

Every tool is scoped to the session workspace. A tutor system prompt is appended
to Pi's default prompt: teach step by step, plan with `todo_write` and close the
list with `todo_clear`, cite sources, save deliverables in the workspace so they
appear in Files, and use the pre-installed tools before installing anything.

The model often plans and then forgets to close the items it finished, so when a
run settles with anything still pending or in progress the server nudges it once
in a hidden turn to reconcile the list. That nudge never shows up as a student
message.

## Pre-install the document tools

The agent runs on a server that already has the usual document, PDF and OCR
tools, so it does not spend a turn (or two minutes) on `apt-get` while the
student waits. Install them once when provisioning:

```bash
sudo server/scripts/install-tools.sh
```

poppler-utils, tesseract (English/Turkish/Arabic), ocrmypdf, ghostscript, qpdf,
ImageMagick, pandoc, LibreOffice, TeX Live, WeasyPrint, ffmpeg, graphviz,
ripgrep and jq. The script is idempotent; set `MENTOR_SKIP_HEAVY=1` to skip
LibreOffice and TeX Live on a small machine. The server probes for these
commands at session start and lists the ones it finds in the system prompt, so
the agent knows what it can use.

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

The APK lands at `web/android/app/build/outputs/apk/debug/app-debug.apk`. Copy
it to `mentor.apk` at the repo root so the release script picks it up.

## Ship a release

Web changes do not need a new APK. Build a bundle and publish it as a GitHub
release; installed apps download it silently and apply it on the next launch:

```bash
cd web
npm run release:web 1.0.1
```

When `mentor.apk` exists at the repo root, the same command attaches it to the
release too and the release is titled `Mentor 1.0.1`. That is what a native
change looks like: one tag with both `mentor.apk` and `mentor-web-1.0.1.zip`.
The script stops if the APK's `versionName` differs from the release version.

The updater lives in `web/src/lib/updater.ts`, defaults to `orev7s/mentor`, and
reads `VITE_UPDATE_REPO` if you want another repo. `docs/UPDATES.md` has the
details.

## Test the UI

With the server running and `~/.mentor-dev/config.json` present:

```bash
cd web
npm run ui-test
```

It connects, sends a prompt that plans with `todo_write`, writes a file and runs
`bash`, then captures the chat, the working row, Files, Changes, model picker,
settings, sidebar, workspace sheet, tablet, fork and phone screens into
`docs/screenshots/`. A failing run leaves `99-failure.png` behind; a passing run
removes it.

`npm run ask-test` covers `ask_student` end to end: it asks for two questions,
picks one option in each, sends the answers, and waits for the agent to finish
the same run. Its screenshots go to `/tmp/opencode`.

`npm run test:failover` in `server/` starts a mock provider that refuses the
first model with a quota error, then checks that the run switches to the free
model, shows no error, and answers. It runs on its own port with a throwaway
data dir, so it does not touch the dev server.