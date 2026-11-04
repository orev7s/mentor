import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";

/** A file the agent made or the student uploaded. */
export interface WorkspaceFile {
  path: string;
  size: number;
  mtime: number;
  ext: string;
  kind: "pdf" | "image" | "document" | "code" | "data" | "other";
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".pi",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  "dist",
]);

export const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".py": "text/plain; charset=utf-8",
  ".js": "text/plain; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".tsx": "text/plain; charset=utf-8",
  ".jsx": "text/plain; charset=utf-8",
  ".sh": "text/x-shellscript; charset=utf-8",
  ".tex": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",
  ".epub": "application/epub+zip",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function fileKind(ext: string): WorkspaceFile["kind"] {
  if (ext === ".pdf") return "pdf";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) return "image";
  if ([".md", ".txt", ".docx", ".html", ".htm", ".tex"].includes(ext)) return "document";
  if (
    [
      ".py",
      ".js",
      ".ts",
      ".tsx",
      ".jsx",
      ".sh",
      ".rs",
      ".go",
      ".java",
      ".c",
      ".cpp",
      ".h",
      ".rb",
      ".php",
      ".ipynb",
    ].includes(ext)
  ) {
    return "code";
  }
  if ([".json", ".csv", ".xlsx"].includes(ext)) return "data";
  return "other";
}

/** Walk the workspace, skipping build dirs and dotfiles. Capped so a big tree stays cheap. */
export async function listWorkspaceFiles(
  root: string,
  dir = "",
  out: WorkspaceFile[] = [],
): Promise<WorkspaceFile[]> {
  if (out.length >= 400) return out;
  let entries;
  try {
    entries = await readdir(join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= 400) break;
    if (entry.name.startsWith(".")) continue;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    const abs = join(root, rel);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await listWorkspaceFiles(root, rel, out);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const info = await stat(abs);
      const ext = extname(entry.name).toLowerCase();
      out.push({
        path: rel,
        size: info.size,
        mtime: info.mtimeMs,
        ext,
        kind: fileKind(ext),
      });
    } catch {
      // a file that vanished mid-walk
    }
  }
  return out;
}