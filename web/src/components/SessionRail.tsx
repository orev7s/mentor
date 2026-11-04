import { useState } from "react";
import type { Mentor } from "@/hooks/use-mentor";
import { PlusIcon, Trash2Icon, XIcon } from "@/lib/chatcn-icons";
import { cn } from "@/lib/utils";

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SessionRail({
  mentor,
  onClose,
}: {
  mentor: Mentor;
  onClose?: () => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="bg-chatcn-bg flex h-full min-h-0 flex-col border-e border-chatcn-border">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <span className="chatcn-text-14 text-chatcn-fg min-w-0 flex-1 truncate font-semibold tracking-tight">
          Mentor
        </span>
        <button
          type="button"
          onClick={() => void mentor.newSession()}
          data-testid="new-chat"
          title="New chat"
          aria-label="New chat"
          className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex size-8 items-center justify-center transition-colors"
        >
          <PlusIcon className="size-4" />
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex size-8 items-center justify-center transition-colors lg:hidden"
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="chatcn-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {mentor.sessions.length === 0 ? (
          <p className="chatcn-text-12 text-chatcn-fg-subtle px-2 py-2">No chats yet.</p>
        ) : null}
        {mentor.sessions.map((session) => {
          const active = session.id === mentor.activeId;
          return (
            <div
              key={session.id}
              onMouseEnter={() => setHovered(session.id)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "group flex min-w-0 items-center gap-1 rounded-chatcn-sm pe-1 transition-colors",
                active ? "bg-chatcn-fill" : "hover:bg-chatcn-fill-hover",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  mentor.openSession(session.id);
                  onClose?.();
                }}
                className="flex min-w-0 flex-1 items-center gap-2 py-2 ps-2 text-start"
                title={session.title}
              >
                <span
                  className={cn(
                    "chatcn-text-13 min-w-0 flex-1 truncate",
                    active ? "text-chatcn-fg" : "text-chatcn-fg-muted",
                  )}
                >
                  {session.title}
                </span>
                <span
                  className={cn(
                    "chatcn-text-12 text-chatcn-fg-subtle tabular-nums",
                    hovered === session.id && "hidden",
                  )}
                >
                  {timeAgo(session.updatedAt)}
                </span>
              </button>
              {hovered === session.id ? (
                <button
                  type="button"
                  onClick={() => void mentor.deleteSession(session.id)}
                  title="Delete chat"
                  aria-label="Delete chat"
                  className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-subtle hover:text-chatcn-red flex size-6 shrink-0 items-center justify-center"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}