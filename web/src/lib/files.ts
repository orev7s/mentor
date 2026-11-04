import { Capacitor, registerPlugin } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

/**
 * Files are served by the agent server.
 *
 * Android's WebView cannot write into Downloads by itself. It either stores a
 * blob under a guessed name (`download.bin`) or hands the URL to a browser.
 * The local Downloader plugin calls Android's DownloadManager, which writes the
 * real name and extension into the public Downloads folder.
 */

export type DownloadState = "pending" | "running" | "successful" | "failed";

interface DownloaderPlugin {
  download(options: {
    url: string;
    filename: string;
    mime?: string;
  }): Promise<{ id: number; filename: string }>;
  status(options: { id: number }): Promise<{ status: DownloadState; filename?: string }>;
  open(options: { id: number }): Promise<void>;
}

/** A best-effort MIME from the file extension, so Android opens the saved file with the right app. */
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function mimeForName(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] : undefined;
}

const Downloader = registerPlugin<DownloaderPlugin>("Downloader");

export interface DownloadResult {
  id: number | null;
  filename: string;
}

/** Open a file for a quick look. Native uses the system browser so PDFs render. */
export async function openFile(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Browser.open({ url });
    } catch {
      window.location.assign(url);
    }
    return;
  }
  window.open(url, "_blank", "noopener");
}

/** Save a file. On Android the native plugin hands it to DownloadManager. */
export async function downloadFile(url: string, filename: string): Promise<DownloadResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await Downloader.download({ url, filename, mime: mimeForName(filename) });
      return { id: result.id, filename: result.filename ?? filename };
    } catch {
      // The plugin is missing in an older APK. Fall back to the browser.
      try {
        await Browser.open({ url });
      } catch {
        window.location.assign(url);
      }
      return { id: null, filename };
    }
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return { id: null, filename };
}

/**
 * How DownloadManager is getting on with the file. A failed status call is not
 * a failed download: the file can be saved while the query is unavailable, so
 * report "unknown" and let the caller keep watching.
 */
export async function downloadStatus(id: number): Promise<DownloadState | "unknown"> {
  if (!Capacitor.isNativePlatform()) return "successful";
  try {
    const result = await Downloader.status({ id });
    return result.status;
  } catch {
    return "unknown";
  }
}

/** Open a finished download with whatever app handles its type. */
export async function openDownload(id: number): Promise<void> {
  await Downloader.open({ id });
}

export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}