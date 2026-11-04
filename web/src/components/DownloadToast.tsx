import { CircleAlertIcon, CircleCheckIcon, DownloadIcon, XIcon } from "@/lib/chatcn-icons";
import type { DownloadState } from "@/lib/files";
import { cn } from "@/lib/utils";

export interface SavedFile {
  id: number | null;
  name: string;
  state: DownloadState | "started";
}

/**
 * A quiet notification that says where a download went. It sits at the top of
 * the screen, where Android and iOS show their own notices, so the student
 * sees the result instead of finding it behind the keyboard or composer.
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
  const started = file.state === "started";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4"
      style={{ top: "calc(var(--safe-top) + 3.5rem)" }}
    >
      <div
        data-slot="download-toast"
        className="toast-down bg-chatcn-surface border-chatcn-border shadow-chatcn-lg pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-chatcn-lg border px-3 py-2.5"
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
          ) : started ? (
            <DownloadIcon className="size-4" />
          ) : (
            <CircleCheckIcon className="size-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="chatcn-text-13 text-chatcn-fg font-medium">
            {failed
              ? "Download failed"
              : running
                ? "Downloading..."
                : started
                  ? "Download started"
                  : "Saved to Downloads"}
          </p>
          <p className="chatcn-text-12 text-chatcn-fg-subtle truncate">
            {started ? `${file.name} · check your notifications` : file.name}
          </p>
        </div>

        {!running && !failed && !started && file.id !== null && onOpen ? (
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