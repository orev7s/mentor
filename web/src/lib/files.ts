import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

/**
 * Files are served by the agent server.
 *
 * Android's WebView does not download on its own and saves a blob with a
 * guessed name, which is how a PDF ends up as `download.bin`. MainActivity
 * installs a DownloadListener that hands the URL to Android's DownloadManager,
 * so the server's Content-Disposition name, extension and MIME type survive.
 * The job is to make the WebView actually hit that listener.
 */

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

/** Save a file. On Android this reaches the DownloadListener, which uses DownloadManager. */
export async function downloadFile(url: string, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Navigating to an attachment URL makes the WebView call onDownloadStart and
    // stay on the page. The listener does the rest with the real file name.
    window.location.assign(url);
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}