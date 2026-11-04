# Mentor: spec and architecture

A Pi-backed tutor agent for one student, reachable from an Android app.

## Goal

An Android app (a Capacitor WebView) that connects to a personal agent server.
The server embeds the [Pi coding agent](https://github.com/earendil-works/pi)
via its TypeScript SDK, gives it education tools, and streams the conversation to
the phone. The student enters a server address and an access token once, then
just chats, uploads documents, and asks questions.

## Components

```
Android app (Capacitor WebView, bundled React UI)
        |  HTTP + Server-Sent Events, bearer token
        v
Agent server (Node, embeds Pi via SDK)
        |  models via Pi's multi-provider layer
        v
LLM providers (OpenRouter, Kilo Gateway, Groq, Cerebras, Gemini, custom OpenAI-compatible)
```

- **Server** (`server/`): Node + Express. Owns the Pi session, the tool set, the
  provider/model configuration, and the access token. Everything the app knows
  about providers is stored here, not on the phone.
- **Web UI** (`web/`): React 19 + Vite + Tailwind 4, with shadcn and the
  chatcn agent components. Chat, tool calls, todos, diffs, files, voice, model
  picker, providers settings. Built into the app bundle.
- **Android** (`web/android/`): Capacitor shell around the built web assets.

## Auth and setup

- On first boot the server generates a random token and writes it to
  `~/.mentor/config.json`. It is stable across restarts. The server prints it at
  startup.
- The app sends `Authorization: Bearer <token>` on every request. The SSE endpoint
  also accepts `?token=` because the browser `EventSource` cannot set headers.
- `/health` and `/` are public so the app can test connectivity before auth.

## Data directory

Default `~/.mentor` (override with `MENTOR_DATA_DIR`):

```
config.json                 server token, host, port, defaults
providers.json via models.json  custom providers (Pi models.json format)
pi-agent/auth.json          API keys for built-in providers
pi-agent/models.json        custom OpenAI-compatible providers
memories.json               long-term facts the student asked the agent to keep
workspaces/<sessionId>/     per-session working dir; uploads go to uploads/
sessions/                   Pi JSONL session files
sessions.json               our session index (title, model, timestamps)
```

## Server API

Model and provider config:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/models` | Full Pi model catalog with a `configured` flag |
| POST | `/models/keys` | `{ provider, key }` set a built-in provider key |
| DELETE | `/models/keys/:provider` | Remove a key |
| GET | `/providers` | Presets, custom providers, configured ids |
| PUT | `/providers/:id` | Upsert a custom OpenAI-compatible provider |
| DELETE | `/providers/:id` | Remove a custom provider |

Sessions:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/sessions` | List sessions |
| POST | `/sessions` | Create `{ model?, thinkingLevel?, title?, parent?, seed? }`. `seed` replays earlier turns for a fork |
| GET | `/sessions/:id` | Metadata plus transcript snapshot |
| PATCH | `/sessions/:id` | `{ model?, thinkingLevel? }` switch a live session |
| DELETE | `/sessions/:id` | Delete session, workspace, and files |
| GET | `/sessions/:id/events` | SSE: `snapshot` then streamed events |
| GET | `/sessions/:id/files` | List the workspace (uploads and generated files) |
| GET | `/sessions/:id/file` | Serve one workspace file; `?download=1` attaches it |
| POST | `/sessions/:id/prompt` | `{ text }`, returns 202 immediately |
| POST | `/sessions/:id/answers` | `{ toolCallId, answers }` resolves a waiting `ask_student` call |
| POST | `/sessions/:id/abort` | Stop the current run |
| POST | `/uploads` | Multipart `file` + `sessionId`, saved into the workspace |
| POST | `/transcribe` | Multipart `file` (audio) + optional `language`; Groq Whisper returns `{ text }` |

## Streaming

The server subscribes to Pi's `AgentSession` events and forwards a trimmed wire
shape over SSE:

- `message_start` / `message_end` carry the message.
- `message_update` carries `event`, `contentIndex`, and `delta` (text and thinking
  deltas). Cumulative `partial` snapshots are stripped to keep frames small.
- `tool_execution_start` / `tool_execution_end` carry tool name and status.
- `agent_settled` marks the run fully done; the client clears its busy state.
- `artifacts` carries `{ files }` for every file created or changed in the run,
  sent just before `agent_settled`. The client renders it as a download card at
  the end of the assistant message.
- `model_switch` carries `{ from, to, reason }` when a quota failover moved the
  session to another model. The client updates the model name silently.
- `error` carries a message string.

The client renders text deltas as they arrive and replaces the buffer with the
authoritative message on `message_end`.

The React client reduces the same events into the chatcn message contract:
text and reasoning parts for deltas, `tool-${name}` parts for tool calls,
`todo_write` inputs for the pinned plan, and normalized tool results for the
renderers (search results, page excerpts, stdout/exit code, unified diffs).
Every `todo_write` after the first is diffed against the one before it and
renders as a short "Completed <task>" row at the point the step finished, so the
trace reads thought, completed step, thought, completed step. All assistant turns
between two user messages share one assistant message, so a multi-step run reads
as one reply with a trace.

## Pi tools (extensions)

Built-in Pi tools (`read`, `write`, `edit`, `bash`) stay on, scoped to the
session workspace. `customTools` adds to that set. Added as custom tools:

| Tool | Does |
| --- | --- |
| `todo_write` | Publishes the plan; the UI pins it above the composer |
| `todo_clear` | Clears the plan once the task is done, so the pinned list does not linger |
| `share_file` | Offers one workspace file as a download card in the reply |
| `ask_student` | Asks one to six multiple-choice questions and waits for the answer |
| `read_document` | Extract text from PDF (unpdf), DOCX (mammoth), HTML (turndown), MD/TXT |
| `ocr_image` | OCR an image with tesseract.js (offline) |
| `memory` | Save, update, delete or list long-term facts about the student, only on request |
| `web_search` | Exa when `EXA_API_KEY` is set, else keyless Bing HTML (DuckDuckGo only as a last resort) |
| `web_fetch` | Fetch a URL, readability to markdown |

Every file tool refuses paths outside the workspace. A tutor system prompt is
appended to Pi's default prompt (teach step by step, plan with `todo_write`,
cite sources, save deliverables in the workspace so Files shows them).

The server pre-installs a document, PDF and OCR toolset so the agent does not
wait on `apt-get` mid-turn: poppler-utils, tesseract with English/Turkish/Arabic
models, ocrmypdf, ghostscript, qpdf, ImageMagick, pandoc, LibreOffice, TeX Live,
WeasyPrint, ffmpeg, graphviz, ripgrep and jq. `server/scripts/install-tools.sh`
installs them (idempotent, `MENTOR_SKIP_HEAVY=1` skips LibreOffice and TeX Live).
At session start the server probes for these commands and puts the live list in
the system prompt, so the agent knows what it can use and only installs a
replacement when one of them is missing or fails.

When a run settles with a plan still marked pending or in progress, the server
sends the model one hidden reminder (`sendCustomMessage`, role `custom`, never
shown as a student turn) to reconcile `todo_write` or call `todo_clear`, so the
pinned list matches reality without the student having to ask.

Long-term memory is one `memories.json` in the data dir, shared by every chat.
The agent may only write to it when the student explicitly asks; the file is
also copied into the system prompt so a fact saved in one chat is known in the
next.

`ask_student` holds the tool call open on a per-session broker until the client
posts answers to `/sessions/:id/answers`. The answers become the tool result, so
the agent continues the same run with them in context. Aborting the run or
disposing the session resolves any waiting question with "no answer". A pending
question survives a reload: the tool call is already in the transcript, so the
card renders again and the broker still holds the wait.

## App shell

- Mobile first and deliberately plain: no top bar and no tab strip. The thread
  fills the screen, the composer sits at the bottom, and the floating buttons
  sit over a short top gradient: the chat list on the left, then voice, new chat
  and an overflow menu with Files, Changes, Model and Settings.
- The sidebar is a ChatGPT-style rail: `Mentor` and a search button, inert
  Projects and Scheduled rows, a divider, the recent chats with "See all...",
  and a footer with a Chat pill and the voice button.
- Files and changes open as a sheet over the chat. On phones it slides up from
  the bottom; on wide screens it is a right drawer. It never opens by itself:
  activity only selects which view the sheet will show when the student opens
  it. There is no terminal view: bash calls stay in the thread as tool rows.
- While a run is in flight a `working` row sits under the thread for every
  model, thinking or not. It shows a shimmering "Working", the current step
  ("Running a command", "Searching the web", "Waiting for your answer") and the
  elapsed time, so instant tool calls never look like nothing happened.
- Messages share one centered column. The student's turns keep a filled bubble,
  the agent's stay flat, and both are centered rather than pinned to opposite
  edges. Every message has Copy; every message has Fork from here; every agent
  reply has Read aloud as a small icon button beside them.
- Voice: the mic records in the WebView, the server sends the clip to Groq
  Whisper (`POST /transcribe`) and the text lands in the composer. It works in
  Turkish, Arabic and English. Read aloud goes through a `Speaker` plugin that
  uses the Android system `TextToSpeech` engine, so it speaks with the voice the
  student already has installed and configured. The page falls back to
  `speechSynthesis` in a browser or on an older APK. The language is picked from
  the script of the text. Without a Groq key the mic says so instead of failing
  silently.
- Forking at a user turn seeds a new session with the turns before it and
  resends that text. Forking at an assistant turn seeds through that reply and
  leaves the new chat ready for the next question. Seeds are text only: Pi is
  given real user and assistant messages, never a tool call without its result.
- The composer keeps only attach, voice and send. Model and provider settings
  live in the overflow menu, so the chat has one obvious place to type. A
  half-written prompt is saved per chat in `localStorage` and restored when the
  student comes back, even if the app was killed and cleared from the
  background.
- Uploaded photos are sent as vision input when the active model accepts images
  (`Model.input` includes `image`). The server reads the small JPEG preview it made
  on upload, base64-encodes it, and passes it to `AgentSession.prompt(text, { images })`.
  On a text-only model, or for any non-image file, the server appends a path note
  and the agent reads the file with `read_document`/`ocr_image`. The note never
  appears in the student's bubble: the client strips it when rendering a user turn.
- The Android back button runs through `window.__mentorHandleBack()`. Open
  overlays (lightbox, file preview, dialogs, the workspace sheet, the chat drawer)
  register a handler and close on back; when nothing is open the WebView walks its
  history and then the activity moves to the background instead of finishing.
- Downloads on Android go through a `Downloader` plugin that hands the URL to
  the system `DownloadManager`, with a MIME type set from the file extension so
  the chooser offers a PDF reader or editor for the saved file. The server sends `Content-Disposition` with the
  real name and extension, so a PDF lands as `report.pdf` in Downloads. The
  client polls the download and shows a notice at the top of the screen (below
  the floating buttons) with Open when it is ready. Open asks the manager for the
  downloaded file's content URI and sends it to `ACTION_VIEW` through
  `Intent.createChooser`, so Android shows the apps that can handle that type and
  grants the chosen one read access. A status query that fails is not a failed
  download: the client keeps watching and says "Download started" if the query
  stays unavailable. In a plain browser a normal `<a download>` is used.
- Android 15 and later run apps edge to edge. `MainActivity` turns the system
  bars into `--safe-top`, `--safe-bottom` and side inset variables, and the app
  shell pads the floating buttons, the drawer and the composer with them. The
  keyboard is handled in the web layer: it compares the shell height with
  `visualViewport.height` and pads only by the difference, so the composer sits
  on the keyboard without a blank gap. The activity uses `adjustNothing`, which
  leaves that one mechanism in charge.
- `web/src/lib/updater.ts` checks GitHub releases on launch (native only),
  downloads a newer web bundle and stages it for the next launch. See
  `docs/UPDATES.md`.

## Providers

Built-in presets: OpenRouter, Groq, Cerebras, Google Gemini, OpenAI, Anthropic,
DeepSeek.

OpenAI-compatible preset: **Kilo Gateway** (`https://ai-gateway.kilo.ai/api/v1`),
whose `:free` models work with no account. Default model `kilo-auto/free`.

Custom provider fields: id, display name, base URL, API (`openai-completions` by
default), API key, and a list of models with context window and max output tokens.

### Free-model failover

If a turn ends with a quota error (`insufficient_quota`, "quota exceeded",
"out of budget", "available balance", billing or 402 wording), the server does
not surface it:

1. The failed model goes on a six hour bench (`quota-bench.json` in the data
   dir), so later turns skip it.
2. It picks the best configured fallback: a model whose id or name says "free"
   first, then a free-tier provider (OpenRouter, Kilo, Groq, Cerebras, Gemini),
   then any other configured model. The failed model is excluded.
3. It switches the session, rewinds the leaf to before the last student turn so
   the replay is one clean user message, and re-runs the turn.
4. It emits `model_switch` instead of `error`. The client updates the model name
   with no dialog.

If nothing else is configured, the quota error is shown as before. Picking a
model by hand lifts its bench.

## Not in v1

- Multi-user accounts. One token, one student.
- Background push notifications.
- Image generation.
- Authentication beyond a bearer token (put it behind HTTPS for public access).
