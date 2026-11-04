import { useMemo, useState } from "react";
import type { Mentor } from "@/hooks/use-mentor";
import {
  AudioLinesIcon,
  CalendarIcon,
  MessageSquareIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
  XIcon,
} from "@/lib/chatcn-icons";
import {
  Sidebar,
  SidebarAction,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
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
 * no "coming soon" label either, so they read as quiet labels rather than dead controls.
 */
function InertRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      data-slot={`nav-${label.toLowerCase()}`}
      aria-hidden="true"
      className="text-sidebar-foreground/40 flex h-8 items-center gap-2.5 rounded-md px-2 text-sm select-none [&_svg]:size-4 [&_svg]:shrink-0"
    >
      <span className="shrink-0">{icon}</span>
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

  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };

  return (
    <Sidebar className="border-sidebar-border border-e">
      <SidebarHeader>
        {searching ? (
          <div className="border-sidebar-border bg-sidebar-accent/60 focus-within:border-sidebar-ring/70 flex h-10 items-center gap-2 rounded-lg border px-2.5 transition-colors">
            <SearchIcon className="text-sidebar-foreground/50 size-4 shrink-0" />
            <input
              data-testid="chat-search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="text-sidebar-foreground placeholder:text-sidebar-foreground/40 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <SidebarAction onClick={closeSearch} aria-label="Close search" className="size-6">
              <XIcon className="size-3.5" />
            </SidebarAction>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-1 py-0.5">
            <span className="from-chatcn-fg to-chatcn-fg-subtle text-chatcn-bg shadow-chatcn-xs flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b">
              <span className="text-[0.9375rem] font-semibold tracking-tight">M</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-sidebar-foreground block truncate text-sm font-semibold tracking-tight">
                Mentor
              </span>
              <span className="text-sidebar-foreground/45 block truncate text-xs">
                Your study tutor
              </span>
            </span>
            <SidebarAction
              onClick={() => setSearching(true)}
              aria-label="Search chats"
              title="Search chats"
            >
              <SearchIcon className="size-4" />
            </SidebarAction>
            {onClose ? (
              <SidebarAction
                onClick={onClose}
                aria-label="Close menu"
                title="Close menu"
                className="lg:hidden"
              >
                <XIcon className="size-4" />
              </SidebarAction>
            ) : null}
          </div>
        )}
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <InertRow icon={<SquarePenIcon />} label="Projects" />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <InertRow icon={<CalendarIcon />} label="Scheduled" />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="min-h-0 flex-1">
          <SidebarGroupLabel className="justify-between">
            <span>Chats</span>
            {filtered.length ? (
              <span className="text-sidebar-foreground/35 tabular-nums">{filtered.length}</span>
            ) : null}
          </SidebarGroupLabel>
          <SidebarMenu>
            {visible.length === 0 ? (
              <p className="text-sidebar-foreground/45 px-2 py-3 text-[0.8125rem]">
                {query.trim() ? "No chats match." : "No chats yet."}
              </p>
            ) : null}
            {visible.map((session) => {
              const active = session.id === mentor.activeId;
              const isHovered = hovered === session.id;
              return (
                <SidebarMenuItem
                  key={session.id}
                  onMouseEnter={() => setHovered(session.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <SidebarMenuButton
                    active={active}
                    onClick={() => {
                      mentor.openSession(session.id);
                      onClose?.();
                    }}
                    title={session.title}
                    className="pe-8"
                  >
                    <MessageSquareIcon
                      className={cn("size-4", active ? "opacity-80" : "opacity-45")}
                    />
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    <span
                      className={cn(
                        "text-sidebar-foreground/40 shrink-0 text-xs tabular-nums",
                        isHovered && "hidden",
                      )}
                    >
                      {timeAgo(session.updatedAt)}
                    </span>
                  </SidebarMenuButton>
                  {isHovered ? (
                    <SidebarAction
                      onClick={() => void mentor.deleteSession(session.id)}
                      title="Delete chat"
                      aria-label="Delete chat"
                      className="text-sidebar-foreground/50 hover:text-chatcn-red absolute end-1 top-1/2 size-7 -translate-y-1/2"
                    >
                      <Trash2Icon className="size-4" />
                    </SidebarAction>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
            {hiddenCount > 0 ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setShowAll(true)}
                  data-testid="see-all-chats"
                  className="text-sidebar-foreground/55 justify-center font-medium"
                >
                  See all {filtered.length} chats
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t">
        <button
          type="button"
          onClick={() => {
            void mentor.newSession();
            onClose?.();
          }}
          data-testid="new-chat"
          className="chatcn-focus bg-chatcn-fg text-chatcn-bg hover:bg-chatcn-primary-hover flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors active:scale-[0.99]"
        >
          <SquarePenIcon className="size-4" />
          New chat
        </button>
        {onVoice ? (
          <button
            type="button"
            onClick={onVoice}
            aria-label="Voice chat"
            title="Voice chat"
            data-testid="voice-chat"
            className="chatcn-focus bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/70 border-sidebar-border flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors active:scale-95"
          >
            <AudioLinesIcon className="size-5" />
          </button>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
