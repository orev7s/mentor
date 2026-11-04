/**
 * End-to-end check for the free-model failover.
 *
 * Starts a mock OpenAI-compatible provider that fails the primary model with a quota error and
 * answers on the fallback, points a throwaway Mentor server at it, then sends one prompt and
 * checks that the run switched models and finished without surfacing an error.
 *
 *   node scripts/failover-test.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME ?? "/home/ubuntu";
const SERVER_DIR = join(HOME, "projects/mentor/server");
const DATA_DIR = "/tmp/opencode/mentor-failover";
const MOCK_PORT = 8899;
const SERVER_PORT = 8791;
const BASE = `http://127.0.0.1:${SERVER_PORT}`;

rmSync(DATA_DIR, { recursive: true, force: true });
mkdirSync(join(DATA_DIR, "pi-agent"), { recursive: true });

/* ---------------------------------------------------------------- mock provider */

const requests = [];

const quotaBody = () =>
  JSON.stringify({
    error: {
      message: "You exceeded your current quota, please check your plan and billing details.",
      type: "insufficient_quota",
      code: "insufficient_quota",
    },
  });

function sse(res, text) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const base = {
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "free-model",
  };
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant" } }] })}\n\n`);
  for (const chunk of text.match(/.{1,8}/gs) ?? [text]) {
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: chunk } }] })}\n\n`);
  }
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 } })}\n\n`,
  );
  res.write("data: [DONE]\n\n");
  res.end();
}

const mock = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const parsed = (() => {
      try {
        return JSON.parse(body);
      } catch {
        return {};
      }
    })();
    const model = parsed.model;
    if (parsed.messages) {
      requests.push({
        model,
        messages: parsed.messages.map((message) => ({
          role: message.role,
          length: typeof message.content === "string" ? message.content.length : Array.isArray(message.content) ? message.content.length : 0,
        })),
      });
    }
    if (req.url?.includes("/chat/completions")) {
      if (model === "quota-model") {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(quotaBody());
        return;
      }
      sse(res, "The free model answered this one.");
      return;
    }
    if (req.url?.includes("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
      return;
    }
    res.writeHead(404).end();
  });
});
await new Promise((resolve) => mock.listen(MOCK_PORT, "127.0.0.1", resolve));

/* ---------------------------------------------------------------- throwaway mentor data */

writeFileSync(
  join(DATA_DIR, "config.json"),
  JSON.stringify(
    {
      token: "test-token",
      host: "127.0.0.1",
      port: SERVER_PORT,
      createdAt: new Date().toISOString(),
      defaultThinkingLevel: "off",
    },
    null,
    2,
  ),
);
writeFileSync(
  join(DATA_DIR, "pi-agent", "models.json"),
  JSON.stringify(
    {
      providers: {
        mock: {
          id: "mock",
          name: "Mock",
          baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
          api: "openai-completions",
          apiKey: "test",
          authHeader: true,
          models: [
            { id: "quota-model", name: "Quota", reasoning: false, contextWindow: 32000, maxTokens: 4096 },
            { id: "free-model", name: "Free", reasoning: false, contextWindow: 32000, maxTokens: 4096 },
          ],
        },
      },
    },
    null,
    2,
  ),
);

/* ---------------------------------------------------------------- server under test */

const server = spawn("node", ["dist/index.js"], {
  cwd: SERVER_DIR,
  env: { ...process.env, MENTOR_DATA_DIR: DATA_DIR, MENTOR_HOST: "127.0.0.1", MENTOR_PORT: String(SERVER_PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));

const auth = { authorization: "Bearer test-token" };
const api = (path, init = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await api("/health");
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("server did not come up");
}

let failed = false;
const events = [];

try {
  await waitForHealth();

  const created = await api("/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "mock/quota-model", thinkingLevel: "off" }),
  });
  const { session } = await created.json();
  console.log("session:", session.id, "model:", session.model);

  // Read the event stream in the background.
  const stream = await fetch(`${BASE}/sessions/${session.id}/events?token=test-token`, {
    headers: { accept: "text/event-stream" },
  });
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const readLoop = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          events.push(JSON.parse(line.slice(5).trim()));
        } catch {
          // ignore
        }
      }
    }
  })();

  await new Promise((resolve) => setTimeout(resolve, 400));
  await api(`/sessions/${session.id}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Say hello." }),
  });

  // Wait for the run to settle.
  for (let i = 0; i < 120; i += 1) {
    if (events.some((event) => event.type === "agent_settled")) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  await reader.cancel().catch(() => {});
  await readLoop.catch(() => {});

  const switched = events.find((event) => event.type === "model_switch");
  const errored = events.find((event) => event.type === "error");
  const settled = events.filter((event) => event.type === "agent_settled").length;
  const text = events
    .filter((event) => event.type === "message_end")
    .map((event) => JSON.stringify(event.message ?? {}))
    .join(" ");

  console.log("model_switch:", switched ? `${switched.from} -> ${switched.to} (${switched.reason})` : "NONE");
  console.log("errors:", errored ? errored.message : "none");
  console.log("settles:", settled);
  console.log("answer includes free text:", text.includes("The free model answered this one."));

  if (!switched) throw new Error("no model_switch event");
  if (switched.to !== "mock/free-model") throw new Error(`unexpected target: ${switched.to}`);
  if (errored) throw new Error(`an error surfaced: ${errored.message}`);
  if (!text.includes("The free model answered this one.")) throw new Error("the fallback never answered");

  const sessions = await api("/sessions").then((res) => res.json());
  console.log("session model after failover:", sessions.sessions[0].model);
  console.log("provider requests:", JSON.stringify(requests, null, 2));
  console.log("FAILOVER TEST PASSED");
} catch (error) {
  failed = true;
  console.error("FAILOVER TEST FAILED:", error.message);
  console.error("events:", events.map((event) => event.type).join(", "));
} finally {
  server.kill("SIGTERM");
  mock.close();
  process.exitCode = failed ? 1 : 0;
}
