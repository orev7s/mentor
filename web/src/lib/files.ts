import { Capacitor, registerPlugin } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

/**
 * Files are served by the agent server.
 *
 * Android's WebView cannot write into Downloads by itself. It either stores a
 * blob under a guessed name (`download.bin`) or hands the URL to a browser.
 * The local Downloader plugin calls Android's DownloadManager, which writes the
 * real name and extension into the public Downloads folder and shows a
 * completion notification. The server sends Content-Disposition too, so links
 * opened outside the app keep their names as well.
 */

interface DownloaderPlugin {
  download(options: { url: string; filename: string }): Promise<{ id: number }>;
}

const Downloader = registerPlugin<DownloaderPlugin>("Downloader");

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
export async function downloadFile(url: string, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Downloader.download({ url, filename });
      return;
    } catch {
      // The plugin is missing in an older APK. Fall back to the browser.
      try {
        await Browser.open({ url });
      } catch {
        window.location.assign(url);
      }
    }
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