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
  chatcn agent components. Chat, tool calls, todos, terminal, diffs, files,
  model picker, providers settings. Built into the app bundle.
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
| POST | `/sessions` | Create `{ model?, thinkingLevel?, title? }` |
| GET | `/sessions/:id` | Metadata plus transcript snapshot |
| PATCH | `/sessions/:id` | `{ model?, thinkingLevel? }` switch a live session |
| DELETE | `/sessions/:id` | Delete session, workspace, and files |
| GET | `/sessions/:id/events` | SSE: `snapshot` then streamed events |
| GET | `/sessions/:id/files` | List the workspace (uploads and generated files) |
| GET | `/sessions/:id/file` | Serve one workspace file; `?download=1` attaches it |
| POST | `/sessions/:id/prompt` | `{ text }`, returns 202 immediately |
| POST | `/sessions/:id/abort` | Stop the current run |
| POST | `/uploads` | Multipart `file` + `sessionId`, saved into the workspace |

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
- `error` carries a message string.

The client renders text deltas as they arrive and replaces the buffer with the
authoritative message on `message_end`.

The React client reduces the same events into the chatcn message contract:
text and reasoning parts for deltas, `tool-${name}` parts for tool calls,
`todo_write` inputs for the pinned plan, and normalized tool results for the
renderers (search results, page excerpts, stdout/exit code, unified diffs). All
assistant turns between two user messages share one assistant message, so a
multi-step run reads as one reply with a trace.

## Pi tools (extensions)

Built-in Pi tools (`read`, `write`, `edit`, `bash`) stay on, scoped to the
session workspace. `customTools` adds to that set. Added as custom tools:

| Tool | Does |
| --- | --- |
| `todo_write` | Publishes the plan; the UI pins it above the composer |
| `share_file` | Offers one workspace file as a download card in the reply |
| `read_document` | Extract text from PDF (unpdf), DOCX (mammoth), HTML (turndown), MD/TXT |
| `ocr_image` | OCR an image with tesseract.js (offline) |
| `web_search` | Exa when `EXA_API_KEY` is set, else keyless DuckDuckGo |
| `web_fetch` | Fetch a URL, readability to markdown |

Every file tool refuses paths outside the workspace. A tutor system prompt is
appended to Pi's default prompt (teach step by step, plan with `todo_write`,
cite sources, save deliverables in the workspace so Files shows them).

## App shell

- Mobile first. Under 900 px of its own width the workspace stacks into Chat,
  Files, Changes and Terminal tabs. Above that the chat and the workspace sit
  side by side, and the header folds either away: one button for the chat list,
  one for the workspace.
- The composer carries the model chip and the providers/settings button, so the
  header stays a title, a run status and the two fold buttons.
- Downloads on Android go through a `DownloadListener` in `MainActivity` that
  hands the URL to the system `DownloadManager`. The server sends
  `Content-Disposition` with the real name and extension, so a PDF lands as
  `report.pdf` in Downloads. In a plain browser a normal `<a download>` is used.
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

## Not in v1

- Multi-user accounts. One token, one student.
- Background push notifications.
- Audio input, image generation.
- Authentication beyond a bearer token (put it behind HTTPS for public access).
