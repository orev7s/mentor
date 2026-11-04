import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Bearer auth. Also accepts `?token=` because the browser EventSource API cannot
 * set request headers, and the SSE endpoint needs to authenticate.
 */
export function bearerAuth(token: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const query = typeof req.query.token === "string" ? req.query.token : "";
    const provided = match?.[1] ?? query;
    if (!provided || !safeEqual(provided, token)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
