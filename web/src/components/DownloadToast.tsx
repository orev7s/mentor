import { CircleAlertIcon, CircleCheckIcon, DownloadIcon, XIcon } from "@/lib/chatcn-icons";
import type { DownloadState } from "@/lib/files";
import { cn } from "@/lib/utils";

export interface SavedFile {
  id: number | null;
  name: string;
  state: DownloadState;
}

/**
 * A quiet bar that says where a download went. DownloadManager writes straight
 * into Downloads, so without this the student taps Download and sees nothing.
 */
export function DownloadToast({
  file,
  onOpen,
  onDismiss,
}: {
  file: SavedFile;
  onOpen?: () => void;
  onDismiss: () => void;
}) {
  const running = file.state === "pending" || file.state === "running";
  const failed = file.state === "failed";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
      style={{ bottom: "calc(var(--safe-bottom) + var(--keyboard-overlap, 0px) + 0.75rem)" }}
    >
      <div
        data-slot="download-toast"
        className="bg-chatcn-surface border-chatcn-border shadow-chatcn-lg pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-chatcn-lg border px-3 py-2.5"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            failed ? "text-chatcn-red" : "text-chatcn-fg-muted",
          )}
        >
          {failed ? (
            <CircleAlertIcon className="size-4" />
          ) : running ? (
            <DownloadIcon className="size-4 animate-pulse" />
          ) : (
            <CircleCheckIcon className="size-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="chatcn-text-13 text-chatcn-fg font-medium">
            {failed ? "Download failed" : running ? "Downloading..." : "Saved to Downloads"}
          </p>
          <p className="chatcn-text-12 text-chatcn-fg-subtle truncate">{file.name}</p>
        </div>

        {!running && !failed && file.id !== null && onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="bg-chatcn-fg text-chatcn-bg rounded-chatcn-sm chatcn-text-12 flex h-8 shrink-0 items-center px-2.5 font-medium"
          >
            Open
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-subtle hover:text-chatcn-fg flex size-7 shrink-0 items-center justify-center"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}