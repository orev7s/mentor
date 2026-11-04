import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import multer from "multer";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ServerConfig } from "../config.js";
import { saveConfig } from "../config.js";
import { bearerAuth } from "../auth.js";
import { AgentManager } from "../agent/manager.js";
import { listModels, resetRuntime } from "../agent/runtime.js";
import { MIME, listWorkspaceFiles } from "../files.js";
import {
  ATTACHMENT_NOTE,
  collectPromptAttachments,
  type PromptAttachment,
} from "../prompt-attachments.js";
import {
  PRESETS,
  apiKeyFor,
  buildCustomProvider,
  providerIdsWithKey,
  readModelsFile,
  removeApiKey,
  removeProvider,
  setApiKey,
  upsertProvider,
} from "../providers.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 },
});

const run = promisify(execFile);

/** Extensions the server can turn into a small JPEG for the app. */
const PREVIEWABLE = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
]);

/**
 * Phone photos are often HEIC or far too large for the Android WebView decoder. Make a small
 * JPEG thumbnail and a reasonably sized preview with ImageMagick, and let the app load those
 * instead of the original. If conversion fails the upload still succeeds and the app falls
 * back to the original file.
 */
async function makeImagePreviews(
  target: string,
  uploadsDir: string,
  safeName: string,
): Promise<{ thumbPath?: string; previewPath?: string }> {
  if (!PREVIEWABLE.has(extname(target).toLowerCase())) return {};
  const previewDir = join(uploadsDir, ".previews");
  const thumbName = `${safeName}.thumb.jpg`;
  const previewName = `${safeName}.preview.jpg`;
  const thumb = join(previewDir, thumbName);
  const preview = join(previewDir, previewName);
  try {
    mkdirSync(previewDir, { recursive: true });
    await Promise.all([
      convertImage(target, thumb, "480x480>", "82", 20_000),
      convertImage(target, preview, "1600x1600>", "85", 30_000),
    ]);
    return {
      thumbPath: `uploads/.previews/${thumbName}`,
      previewPath: `uploads/.previews/${previewName}`,
    };
  } catch {
    return {};
  }
}

/**
 * One ImageMagick decode. ImageMagick 7 ships `magick`; older installs only have
 * `convert`. Try both so a phone photo still gets a JPEG the WebView can decode.
 */
async function convertImage(
  source: string,
  output: string,
  size: string,
  quality: string,
  timeout: number,
): Promise<void> {
  const args = [
    source,
    "-auto-orient",
    "-thumbnail",
    size,
    "-strip",
    "-quality",
    quality,
    output,
  ];
  try {
    await run("magick", args, { timeout });
  } catch {
    await run("convert", args, { timeout });
  }
}

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export function createServer(config: ServerConfig, manager: AgentManager) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "4mb" }));

  app.get("/api", (_req, res) => {
    res.json({ name: "mentor-server", version: 1, status: "ok" });
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // --- static web UI and app download (public) ---

  const webDir = process.env.MENTOR_WEB_DIR ?? resolve(process.cwd(), "../web/dist");
  if (existsSync(webDir)) {
    app.use(express.static(webDir, { index: false }));
    app.get("/", (_req, res) => {
      res.sendFile(join(webDir, "index.html"));
    });
  }

  const apkPath = process.env.MENTOR_APK ?? resolve(process.cwd(), "../mentor.apk");
  if (existsSync(apkPath)) {
    app.get("/mentor.apk", (_req, res) => {
      res.download(apkPath, "mentor.apk");
    });
  }

  // Everything below requires the bearer token.
  app.use(bearerAuth(config.token));

  // --- models and providers ---

  app.get("/settings", (_req, res) => {
    res.json({
      defaultModel: config.defaultModel ?? null,
      defaultThinkingLevel: config.defaultThinkingLevel ?? "medium",
    });
  });

  app.post("/settings", (req, res) => {
    const body = req.body ?? {};
    if (typeof body.defaultModel === "string" || body.defaultModel === null) {
      config.defaultModel = body.defaultModel ?? undefined;
    }
    if (typeof body.defaultThinkingLevel === "string") {
      config.defaultThinkingLevel = body.defaultThinkingLevel;
    }
    saveConfig(config);
    res.json({
      ok: true,
      defaultModel: config.defaultModel ?? null,
      defaultThinkingLevel: config.defaultThinkingLevel ?? "medium",
    });
  });

  app.get(
    "/models",
    asyncHandler(async (_req, res) => {
      res.json({ models: await listModels() });
    }),
  );

  app.post(
    "/models/keys",
    asyncHandler(async (req, res) => {
      const { provider, key } = req.body ?? {};
      if (typeof provider !== "string" || typeof key !== "string" || !key) {
        res.status(400).json({ error: "provider and key are required" });
        return;
      }
      setApiKey(provider, key);
      await resetRuntime();
      res.json({ ok: true });
    }),
  );

  app.delete(
    "/models/keys/:provider",
    asyncHandler(async (req, res) => {
      removeApiKey(String(req.params.provider));
      await resetRuntime();
      res.json({ ok: true });
    }),
  );

  app.get(
    "/providers",
    asyncHandler(async (_req, res) => {
      res.json({
        presets: PRESETS,
        custom: Object.values(readModelsFile().providers),
        configured: [...providerIdsWithKey()],
      });
    }),
  );

  app.put(
    "/providers/:id",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const provider = buildCustomProvider({ id: String(req.params.id), ...body });
      upsertProvider(provider);
      await resetRuntime();
      res.json({ ok: true, provider });
    }),
  );

  app.delete(
    "/providers/:id",
    asyncHandler(async (req, res) => {
      removeProvider(String(req.params.id));
      await resetRuntime();
      res.json({ ok: true });
    }),
  );

  // --- sessions ---

  app.get(
    "/sessions",
    asyncHandler(async (_req, res) => {
      res.json({ sessions: manager.list() });
    }),
  );

  app.post(
    "/sessions",
    asyncHandler(async (req, res) => {
      const { model, thinkingLevel, webAccess, title, parent, seed } = req.body ?? {};
      const session = await manager.create({
        model: typeof model === "string" && model ? model : config.defaultModel,
        thinkingLevel:
          typeof thinkingLevel === "string"
            ? (thinkingLevel as ThinkingLevel)
            : (config.defaultThinkingLevel as ThinkingLevel | undefined),
        webAccess: typeof webAccess === "boolean" ? webAccess : undefined,
        title,
        parent: typeof parent === "string" ? parent : undefined,
        seed: Array.isArray(seed)
          ? (seed as { role?: unknown; text?: unknown }[])
              .filter(
                (item) =>
                  (item?.role === "user" || item?.role === "assistant") &&
                  typeof item?.text === "string",
              )
              .map((item) => ({ role: item.role as "user" | "assistant", text: item.text as string }))
          : undefined,
      });
      res.status(201).json({ session: session.meta });
    }),
  );

  app.get(
    "/sessions/:id",
    asyncHandler(async (req, res) => {
      const session = await manager.get(String(req.params.id));
      res.json(session.snapshot());
    }),
  );

  app.patch(
    "/sessions/:id",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const meta = await manager.update(String(req.params.id), {
        model: typeof body.model === "string" ? body.model : undefined,
        thinkingLevel:
          typeof body.thinkingLevel === "string"
            ? (body.thinkingLevel as ThinkingLevel)
            : undefined,
        webAccess: typeof body.webAccess === "boolean" ? body.webAccess : undefined,
      });
      res.json({ session: meta });
    }),
  );

  app.delete(
    "/sessions/:id",
    asyncHandler(async (req, res) => {
      await manager.delete(String(req.params.id));
      res.json({ ok: true });
    }),
  );

  app.post(
    "/sessions/:id/prompt",
    asyncHandler(async (req, res) => {
      const rawText = req.body?.text;
      const text = typeof rawText === "string" ? rawText.trim() : "";
      const attachments: PromptAttachment[] = Array.isArray(req.body?.attachments)
        ? (req.body.attachments as unknown[]).flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const value = item as Record<string, unknown>;
            return [
              {
                path: typeof value.path === "string" ? value.path : undefined,
                previewPath:
                  typeof value.previewPath === "string" ? value.previewPath : undefined,
                name: typeof value.name === "string" ? value.name : undefined,
              },
            ];
          })
        : [];
      if (!text && !attachments.length) {
        res.status(400).json({ error: "text or attachments are required" });
        return;
      }
      const session = await manager.get(String(req.params.id));

      // Photos go to the model as vision input; everything else stays a path the
      // agent reads with a tool. The note is a wire detail, not a second user turn.
      const { images, notes } = await collectPromptAttachments(
        session.meta.cwd,
        attachments,
        session.supportsImages(),
      );
      const payload = text + (notes.length ? ATTACHMENT_NOTE + notes.join("\n") : "");

      if (session.meta.title === "New chat") {
        manager.rename(session.meta.id, (text || "New chat").slice(0, 60));
      }
      void session.prompt(payload, images);
      res.status(202).json({ ok: true });
    }),
  );

  app.post(
    "/sessions/:id/answers",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const toolCallId = typeof body.toolCallId === "string" ? body.toolCallId : "";
      const raw = Array.isArray(body.answers) ? (body.answers as unknown[]) : [];
      const answers = raw.flatMap((item: unknown) => {
        if (!item || typeof item !== "object") return [];
        const value = item as { question?: unknown; selected?: unknown };
        return [
          {
            question: typeof value.question === "string" ? value.question : "",
            selected: Array.isArray(value.selected)
              ? value.selected.filter((entry: unknown): entry is string => typeof entry === "string")
              : [],
          },
        ];
      });
      if (!toolCallId || !answers.length) {
        res.status(400).json({ error: "toolCallId and answers are required" });
        return;
      }
      const session = await manager.get(String(req.params.id));
      if (!session.answerQuestions(toolCallId, answers)) {
        res.status(409).json({ error: "This question is no longer waiting for an answer." });
        return;
      }
      res.json({ ok: true });
    }),
  );

  app.post(
    "/sessions/:id/abort",
    asyncHandler(async (req, res) => {
      const session = await manager.get(String(req.params.id));
      await session.abort();
      res.json({ ok: true });
    }),
  );

  app.get("/sessions/:id/events", (req, res) => {
    manager
      .get(String(req.params.id))
      .then((session) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write(`event: snapshot\ndata: ${JSON.stringify(session.snapshot())}\n\n`);
        const unsubscribe = session.subscribe((event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        });
        const ping = setInterval(() => res.write(": ping\n\n"), 15000);
        req.on("close", () => {
          clearInterval(ping);
          unsubscribe();
        });
      })
      .catch((error: unknown) => {
        res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
      });
  });

  app.get(
    "/sessions/:id/files",
    asyncHandler(async (req, res) => {
      const session = await manager.get(String(req.params.id));
      const files = await listWorkspaceFiles(session.meta.cwd);
      files.sort((a, b) => b.mtime - a.mtime);
      res.json({ files });
    }),
  );

  app.get(
    "/sessions/:id/file",
    asyncHandler(async (req, res) => {
      const session = await manager.get(String(req.params.id));
      const root = resolve(session.meta.cwd);
      const rel = String(req.query.path ?? "");
      if (!rel) {
        res.status(400).json({ error: "path is required" });
        return;
      }
      const abs = resolve(root, rel);
      if (abs !== root && !abs.startsWith(root + sep)) {
        res.status(400).json({ error: "path is outside the workspace" });
        return;
      }
      const info = await stat(abs).catch(() => null);
      if (!info?.isFile()) {
        res.status(404).json({ error: "file not found" });
        return;
      }
      const ext = extname(abs).toLowerCase();
      const name = basename(abs).replace(/["\\\r\n]/g, "_");
      res.setHeader("content-type", MIME[ext] ?? "application/octet-stream");
      res.setHeader("cache-control", "no-store");
      if (req.query.download) {
        res.setHeader(
          "content-disposition",
          `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        );
      } else {
        res.setHeader("content-disposition", `inline; filename="${name}"`);
      }
      // The data dir can be a dotfile path (~/.mentor), which sendFile blocks by default.
      res.sendFile(abs, { dotfiles: "allow" });
    }),
  );

  // --- voice ---

  /** Speech to text through Groq Whisper. The key stays on the server. */
  app.post("/transcribe", upload.single("file"), asyncHandler(async (req, res) => {
    const key = apiKeyFor("groq");
    if (!key) {
      res.status(400).json({
        error: "Voice input needs a Groq API key. Add one in Settings, under Providers.",
      });
      return;
    }
    if (!req.file?.buffer?.length) {
      res.status(400).json({ error: "An audio file is required" });
      return;
    }
    const language = typeof req.body?.language === "string" ? req.body.language.slice(0, 2) : "";
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype || "audio/webm" }),
      req.file.originalname || "voice.webm",
    );
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "json");
    if (language) form.append("language", language);

    let upstream: Awaited<ReturnType<typeof fetch>>;
    try {
      upstream = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body: form,
      });
    } catch (error) {
      res.status(502).json({
        error: `Could not reach the transcription service: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => "")).slice(0, 300);
      res.status(502).json({
        error: `Transcription failed (${upstream.status})${detail ? `: ${detail}` : "."}`,
      });
      return;
    }
    const data = (await upstream.json()) as { text?: string };
    res.json({ text: (data.text ?? "").trim() });
  }));

  // --- uploads ---

  app.post(
    "/uploads",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const sessionId = String(req.body?.sessionId ?? req.query.sessionId ?? "");
      if (!sessionId || !req.file) {
        res.status(400).json({ error: "sessionId and file are required" });
        return;
      }
      const session = await manager.get(sessionId);
      const dir = join(session.meta.cwd, "uploads");
      mkdirSync(dir, { recursive: true });
      const safeName = basename(req.file.originalname).replace(/[^\w.\- ]/g, "_");
      const target = join(dir, safeName);
      writeFileSync(target, req.file.buffer);
      const previews = await makeImagePreviews(target, dir, safeName);
      res.status(201).json({
        path: `uploads/${safeName}`,
        size: req.file.size,
        mime: req.file.mimetype,
        ...previews,
      });
    }),
  );

  // Error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  });

  return app;
}
