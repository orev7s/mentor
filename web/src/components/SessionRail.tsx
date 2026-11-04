import { useMemo, useState } from "react";
import type { Mentor } from "@/hooks/use-mentor";
import {
  AudioLinesIcon,
  CalendarIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
  XIcon,
} from "@/lib/chatcn-icons";
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

/** How many chats show before "See all". */
const PREVIEW_COUNT = 8;

/**
 * Rows that are places we do not have yet. They are not buttons on purpose: nothing to tap, and
 * no "coming soon" label either.
 */
function InertRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      data-slot={`nav-${label.toLowerCase()}`}
      aria-hidden="true"
      className="chatcn-text-14 text-chatcn-fg-muted flex h-10 items-center gap-3 px-2 select-none"
    >
      <span className="text-chatcn-fg-subtle shrink-0 [&_svg]:size-5">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

export function SessionRail({
  mentor,
  onClose,
  onVoice,
}: {
  mentor: Mentor;
  onClose?: () => void;
  /** Opens voice input. Hidden when the voice feature is unavailable. */
  onVoice?: () => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return mentor.sessions;
    return mentor.sessions.filter((session) => session.title.toLowerCase().includes(needle));
  }, [mentor.sessions, query]);

  const visible = query.trim() || showAll ? filtered : filtered.slice(0, PREVIEW_COUNT);
  const hiddenCount = filtered.length - visible.length;

  return (
    <div className="bg-chatcn-bg-subtle border-chatcn-border flex h-full min-h-0 flex-col border-e">
      <div className="flex h-14 shrink-0 items-center gap-1 px-2">
        {searching ? (
          <>
            <SearchIcon className="text-chatcn-fg-subtle size-4 shrink-0" />
            <input
              data-testid="chat-search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="chatcn-text-14 text-chatcn-fg placeholder:text-chatcn-fg-subtle min-w-0 flex-1 bg-transparent outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setSearching(false);
                setQuery("");
              }}
              aria-label="Close search"
              className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-subtle hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex size-8 shrink-0 items-center justify-center transition-colors"
            >
              <XIcon className="size-4" />
            </button>
          </>
        ) : (
          <>
            <span className="chatcn-text-16 text-chatcn-fg min-w-0 flex-1 truncate px-1 font-semibold tracking-tight">
              Mentor
            </span>
            <button
              type="button"
              onClick={() => setSearching(true)}
              aria-label="Search chats"
              title="Search chats"
              className="chatcn-focus rounded-chatcn-md text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex size-9 items-center justify-center transition-colors"
            >
              <SearchIcon className="size-5" />
            </button>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="chatcn-focus rounded-chatcn-md text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex size-9 items-center justify-center transition-colors lg:hidden"
              >
                <XIcon className="size-5" />
              </button>
            ) : null}
          </>
        )}
      </div>

      <div className="shrink-0 px-2">
        <InertRow icon={<SquarePenIcon />} label="Projects" />
        <InertRow icon={<CalendarIcon />} label="Scheduled" />
      </div>

      <div className="border-chatcn-border my-2 shrink-0 border-t" />

      <div className="chatcn-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {visible.length === 0 ? (
          <p className="chatcn-text-13 text-chatcn-fg-subtle px-2 py-3">
            {query.trim() ? "No chats match." : "No chats yet."}
          </p>
        ) : null}
        {visible.map((session) => {
          const active = session.id === mentor.activeId;
          return (
            <div
              key={session.id}
              onMouseEnter={() => setHovered(session.id)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "group flex min-w-0 items-center rounded-chatcn-md pe-1 transition-colors",
                active ? "bg-chatcn-fill" : "hover:bg-chatcn-fill-hover",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  mentor.openSession(session.id);
                  onClose?.();
                }}
                className="flex min-w-0 flex-1 items-center gap-2 py-2.5 ps-2.5 text-start"
                title={session.title}
              >
                <span
                  className={cn(
                    "chatcn-text-14 min-w-0 flex-1 truncate",
                    active ? "text-chatcn-fg" : "text-chatcn-fg-muted",
                  )}
                >
                  {session.title}
                </span>
                <span
                  className={cn(
                    "chatcn-text-12 text-chatcn-fg-subtle shrink-0 tabular-nums",
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
                  className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-subtle hover:text-chatcn-red flex size-7 shrink-0 items-center justify-center"
                >
                  <Trash2Icon className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            data-testid="see-all-chats"
            className="chatcn-focus rounded-chatcn-md text-chatcn-fg-subtle hover:bg-chatcn-fill-hover hover:text-chatcn-fg chatcn-text-14 flex w-full items-center px-2.5 py-2.5 text-start transition-colors"
          >
            See all...
          </button>
        ) : null}
      </div>

      <div className="border-chatcn-border flex shrink-0 items-center gap-2 border-t px-2 py-3">
        <button
          type="button"
          onClick={() => {
            void mentor.newSession();
            onClose?.();
          }}
          data-testid="new-chat"
          className="chatcn-focus bg-chatcn-primary text-chatcn-primary-fg hover:bg-chatcn-primary-hover chatcn-text-14 flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 font-medium transition-colors active:scale-[0.99]"
        >
          <SquarePenIcon className="size-5" />
          Chat
        </button>
        {onVoice ? (
          <button
            type="button"
            onClick={onVoice}
            aria-label="Voice chat"
            title="Voice chat"
            data-testid="voice-chat"
            className="chatcn-focus bg-chatcn-fill text-chatcn-fg hover:bg-chatcn-fill-hover border-chatcn-border flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors active:scale-95"
          >
            <AudioLinesIcon className="size-5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
