import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import multer from "multer";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ServerConfig } from "../config.js";
import { saveConfig } from "../config.js";
import { bearerAuth } from "../auth.js";
import { AgentManager } from "../agent/manager.js";
import { listModels, resetRuntime } from "../agent/runtime.js";
import {
  PRESETS,
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
      const { model, thinkingLevel, title } = req.body ?? {};
      const session = await manager.create({
        model,
        thinkingLevel: thinkingLevel as ThinkingLevel | undefined,
        title,
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
      const text = req.body?.text;
      if (typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "text is required" });
        return;
      }
      const session = await manager.get(String(req.params.id));
      if (session.meta.title === "New chat") {
        manager.rename(session.meta.id, text.trim().slice(0, 60));
      }
      void session.prompt(text);
      res.status(202).json({ ok: true });
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

  // --- uploads ---

  app.post("/uploads", upload.single("file"), (req, res) => {
    const sessionId = String(req.body?.sessionId ?? req.query.sessionId ?? "");
    if (!sessionId || !req.file) {
      res.status(400).json({ error: "sessionId and file are required" });
      return;
    }
    manager
      .get(sessionId)
      .then((session) => {
        const dir = join(session.meta.cwd, "uploads");
        mkdirSync(dir, { recursive: true });
        const safeName = basename(req.file!.originalname).replace(/[^\w.\- ]/g, "_");
        const target = join(dir, safeName);
        writeFileSync(target, req.file!.buffer);
        res.status(201).json({
          path: `uploads/${safeName}`,
          size: req.file!.size,
          mime: req.file!.mimetype,
        });
      })
      .catch((error: unknown) => {
        res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
      });
  });

  // Error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  });

  return app;
}
