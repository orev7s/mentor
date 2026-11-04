import { useMemo, useState } from "react";
import type { Mentor } from "@/hooks/use-mentor";
import {
  AudioLinesIcon,
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

interface ChatGroup {
  label: string;
  sessions: Mentor["sessions"];
}

const DAY = 86_400_000;

/**
 * Chats by recency, the way ChatGPT and Claude group them: Today, Yesterday, the
 * last week, the last month, then everything older. Empty groups are dropped, so
 * the list never shows a heading with nothing under it.
 */
function groupChats(sessions: Mentor["sessions"]): ChatGroup[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const buckets: { label: string; from: number }[] = [
    { label: "Today", from: today },
    { label: "Yesterday", from: today - DAY },
    { label: "Previous 7 days", from: today - 7 * DAY },
    { label: "Previous 30 days", from: today - 30 * DAY },
    { label: "Older", from: Number.NEGATIVE_INFINITY },
  ];
  const groups: ChatGroup[] = [];
  for (let i = 0; i < buckets.length; i += 1) {
    const { label, from } = buckets[i]!;
    const to = i === 0 ? Number.POSITIVE_INFINITY : buckets[i - 1]!.from;
    const items = sessions.filter((s) => s.updatedAt >= from && s.updatedAt < to);
    if (items.length) groups.push({ label, sessions: items });
  }
  return groups;
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return mentor.sessions;
    return mentor.sessions.filter((session) => session.title.toLowerCase().includes(needle));
  }, [mentor.sessions, query]);

  // While searching, keep it a flat list so the matches are obvious. Otherwise
  // the history reads by day, like every other chat app.
  const groups = useMemo<ChatGroup[]>(
    () =>
      query.trim()
        ? filtered.length
          ? [{ label: "Results", sessions: filtered }]
          : []
        : groupChats(filtered),
    [filtered, query],
  );

  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };

  return (
    <Sidebar className="border-sidebar-border border-e">
      <SidebarHeader className="gap-1.5 p-2">
        {searching ? (
          <div className="border-sidebar-border bg-sidebar-accent/50 focus-within:border-sidebar-ring/70 flex h-9 items-center gap-2 rounded-md border px-2.5 transition-colors">
            <SearchIcon className="text-sidebar-foreground/45 size-4 shrink-0" />
            <input
              data-testid="chat-search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="text-sidebar-foreground placeholder:text-sidebar-foreground/35 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <SidebarAction onClick={closeSearch} aria-label="Close search" className="size-6">
              <XIcon className="size-3.5" />
            </SidebarAction>
          </div>
        ) : (
          <div className="flex h-9 items-center gap-1 ps-2">
            <span className="text-sidebar-foreground min-w-0 flex-1 truncate text-[0.9375rem] font-semibold tracking-tight">
              Mentor
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

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                void mentor.newSession();
                onClose?.();
              }}
              data-testid="new-chat"
              className="bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/70 h-9 font-medium"
            >
              <SquarePenIcon className="size-4" />
              New chat
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2 pt-0 pb-2">
        {groups.length === 0 ? (
          <p className="text-sidebar-foreground/40 px-2 py-3 text-[0.8125rem]">
            {query.trim() ? "No chats match." : "No chats yet."}
          </p>
        ) : null}
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="gap-0.5">
            <SidebarGroupLabel className="bg-sidebar sticky top-0 z-10 mt-2">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.sessions.map((session) => {
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
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        mentor.openSession(session.id);
                        onClose?.();
                      }}
                      title={session.title}
                      className="pe-8"
                    >
                      <span className="min-w-0 flex-1 truncate">{session.title}</span>
                      <span
                        className={cn(
                          "text-sidebar-foreground/35 shrink-0 text-xs tabular-nums",
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
                        className="text-sidebar-foreground/45 hover:text-chatcn-red absolute end-1 top-1/2 size-7 -translate-y-1/2"
                      >
                        <Trash2Icon className="size-4" />
                      </SidebarAction>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {onVoice ? (
        <SidebarFooter>
          <SidebarMenuButton
            onClick={onVoice}
            data-testid="voice-chat"
            className="text-sidebar-foreground/70"
          >
            <AudioLinesIcon className="size-4" />
            Voice chat
          </SidebarMenuButton>
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}
