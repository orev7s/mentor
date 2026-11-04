import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

/** Resolve a path and refuse anything outside the session workspace. */
function withinWorkspace(workspace: string, path: string): string {
  const root = resolve(workspace);
  const abs = resolve(root, path);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`Path is outside the workspace: ${path}`);
  }
  return abs;
}

/**
 * Lets the agent hand the student one specific file. The client renders the
 * result as a download card, so the agent can point at the deliverable it just
 * made instead of relying on the student to find it in a file list.
 */
export function buildShareTool(workspace: string) {
  return defineTool({
    name: "share_file",
    label: "Share file",
    description:
      "Offer a file from the workspace to the student as a download card. Call it after you create a deliverable (PDF, notes, worksheet, slides, script) or when the student asks for a specific file. The path is relative to the workspace root, for example report.pdf or notes/answer.md.",
    parameters: Type.Object({
      path: Type.String({ description: "Path relative to the workspace root" }),
      label: Type.Optional(
        Type.String({ description: "Short name the student sees, e.g. 'Your revision sheet'" }),
      ),
      description: Type.Optional(
        Type.String({ description: "One line about what the file contains" }),
      ),
    }),
    execute: async (
      _id: string,
      params: { path: string; label?: string; description?: string },
    ) => {
      const abs = withinWorkspace(workspace, params.path);
      const info = await stat(abs).catch(() => null);
      if (!info?.isFile()) throw new Error(`File not found: ${params.path}`);
      const label = params.label?.trim() || params.path.split("/").pop() || params.path;
      return {
        content: [
          {
            type: "text" as const,
            text: `Shared ${label} (${params.path}, ${info.size} bytes).`,
          },
        ],
        details: {
          path: params.path,
          label,
          description: params.description,
          size: info.size,
          mtime: info.mtimeMs,
        },
      };
    },
  });
}