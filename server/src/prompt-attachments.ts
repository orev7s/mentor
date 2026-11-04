import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import type { PromptOptions } from "@earendil-works/pi-coding-agent";

/** Image inputs the providers in the preset list can decode directly. */
export type PromptImage = NonNullable<PromptOptions["images"]>[number];
export type PromptImages = PromptImage[];

/**
 * Appended to the model-facing prompt for files that are not sent as vision
 * input, so the agent knows what to read. The mobile client strips this from the
 * student's bubble, so the note never shows up as a second "attached files" turn.
 */
export const ATTACHMENT_NOTE =
  "\n\nAttached files (read them with read_document, or ocr_image for photos and scans):\n";

/** What the client sends per pending attachment. */
export interface PromptAttachment {
  path?: string;
  /** Smaller server-made JPEG, used for vision when present. */
  previewPath?: string;
  name?: string;
}

const IMAGE_EXT = new Set([
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

/** Formats an OpenAI-compatible vision endpoint accepts as-is. */
const SENDABLE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

/**
 * Turn the client's attachment list into vision inputs plus the notes for the
 * files the agent still has to read with a tool. Paths are confined to the
 * session workspace, and any file that cannot be read becomes a note rather
 * than failing the prompt.
 */
export async function collectPromptAttachments(
  cwd: string,
  attachments: PromptAttachment[],
  allowImages: boolean,
): Promise<{ images: PromptImages; notes: string[] }> {
  const root = resolve(cwd);
  const images: PromptImages = [];
  const notes: string[] = [];

  for (const attachment of attachments) {
    const rel = typeof attachment.path === "string" ? attachment.path : "";
    if (!rel) continue;
    const abs = resolve(root, rel);
    if (!isInside(root, abs)) continue;
    const name = attachment.name || rel.split("/").pop() || rel;
    const ext = extname(name).toLowerCase();

    if (IMAGE_EXT.has(ext) && allowImages) {
      const rendered = sendableImage(root, attachment);
      if (rendered) {
        images.push(rendered);
        continue;
      }
    }
    notes.push(`- ${rel}`);
  }

  return { images, notes };
}

/** Read the best image the model can decode: the preview JPEG, else the original. */
function sendableImage(root: string, attachment: PromptAttachment): PromptImage | null {
  const candidates: Array<{ path: string; mime: string }> = [];
  const preview = attachment.previewPath;
  if (typeof preview === "string" && preview) {
    const abs = resolve(root, preview);
    if (isInside(root, abs)) candidates.push({ path: abs, mime: "image/jpeg" });
  }
  const original = attachment.path;
  if (typeof original === "string" && original) {
    const abs = resolve(root, original);
    const mime = SENDABLE_MIME[extname(abs).toLowerCase()];
    if (isInside(root, abs) && mime) candidates.push({ path: abs, mime });
  }

  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate.path) || !statSync(candidate.path).isFile()) continue;
      const data = readFileSync(candidate.path).toString("base64");
      if (!data) continue;
      return { type: "image", data, mimeType: candidate.mime };
    } catch {
      // try the next candidate, else fall through to a note
    }
  }
  return null;
}
