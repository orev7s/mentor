import { useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import { useMentor } from "@/hooks/use-mentor";
import { ConnectScreen } from "@/components/ConnectScreen";
import { SessionRail } from "@/components/SessionRail";
import { ModelDialog } from "@/components/ModelDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { DownloadToast, type SavedFile } from "@/components/DownloadToast";
import { MentorAgent, todosFrom } from "@/components/mentor-agent";
import type { TodoItem } from "@/components/ui/chatcn/todo-list";
import { useBackHandler } from "@/lib/back";
import { redirectToServer } from "@/lib/remote";
import { PanelLeftIcon, XIcon } from "@/lib/chatcn-icons";
import { getToolName, isToolPart, type ChatcnMessage } from "@/lib/chatcn-types";
import {
  downloadFile,
  downloadStatus,
  fileName,
  openDownload,
  openFile,
} from "@/lib/files";

const TODO_TOOLS = new Set(["todo_write", "todowrite", "write_todos", "update_todos"]);
const TODO_CLEAR_TOOLS = new Set(["todo_clear", "clear_todos"]);

/**
 * The model sometimes sends only the item it just finished instead of the whole list.
 * Merge every todo update by title so the pinned plan keeps all of its steps. A
 * todo_clear call resets the merge, so a finished plan does not linger.
 */
function mergedTodos(messages: ChatcnMessage[]): TodoItem[] {
  const byTitle = new Map<string, TodoItem>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolPart(part)) continue;
      const name = getToolName(part);
      if (TODO_CLEAR_TOOLS.has(name)) {
        byTitle.clear();
        continue;
      }
      if (!TODO_TOOLS.has(name)) continue;
      for (const item of todosFrom(part.input)) byTitle.set(item.title, item);
    }
  }
  return [...byTitle.values()];
}

export default function App() {
  const mentor = useMentor();
  const [railOpen, setRailOpen] = useState(false);
  // Android back closes the chat drawer instead of leaving the app.
  useBackHandler(railOpen, () => setRailOpen(false));
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [saved, setSaved] = useState<SavedFile | null>(null);
  const [voiceSignal, setVoiceSignal] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  // The drawer follows the finger while a horizontal gesture is in progress.
  // `null` means not dragging; a number is the drawer's translateX in pixels.
  const [railDrag, setRailDrag] = useState<number | null>(null);
  const [railWidth, setRailWidth] = useState(280);
  const railDragRef = useRef<number | null>(null);
  railDragRef.current = railDrag;
  const gesture = useRef<{
    startX: number;
    startY: number;
    open: boolean;
    width: number;
    active: boolean;
  } | null>(null);
  const todos = useMemo(() => mergedTodos(mentor.messages), [mentor.messages]);

  // First native pairing: hand the connection to the server origin and reload
  // there, so the UI runs same-origin with the agent (images and streams included).
  useEffect(() => {
    if (mentor.connected) redirectToServer(mentor.url, mentor.token);
  }, [mentor.connected, mentor.url, mentor.token]);

  const onSwipeStart = (event: ReactTouchEvent) => {
    // The desktop rail is a fixed column, so swipes only matter on the drawer.
    if (event.touches.length !== 1 || window.matchMedia("(min-width: 1024px)").matches) {
      gesture.current = null;
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    const width = Math.min(280, window.innerWidth * 0.85);
    setRailWidth(width);
    gesture.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      open: railOpen,
      width,
      active: false,
    };
  };

  const onSwipeMove = (event: ReactTouchEvent) => {
    const active = gesture.current;
    if (!active || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - active.startX;
    const dy = touch.clientY - active.startY;
    if (!active.active) {
      // Wait for a horizontal intent, and require the edge when opening.
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (!active.open && active.startX > 40) {
        gesture.current = null;
        return;
      }
      active.active = true;
    }
    const base = active.open ? 0 : -active.width;
    const next = Math.max(-active.width, Math.min(0, base + dx));
    setRailDrag(next);
  };

  const endSwipe = () => {
    const active = gesture.current;
    gesture.current = null;
    if (!active?.active) {
      setRailDrag(null);
      return;
    }
    const current = railDragRef.current ?? (active.open ? 0 : -active.width);
    setRailDrag(null);
    // Past halfway, or a decisive flick, opens; otherwise it settles closed.
    setRailOpen(current > -active.width * 0.5);
  };

  const clearTimers = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    pollTimer.current = null;
    hideTimer.current = null;
  };

  useEffect(() => clearTimers, []);

  /**
   * Android and iOS shrink the visual viewport when the keyboard opens, but
   * they do not always shrink the layout viewport with it. Compare the two and
   * only pad by the difference, so the composer never floats above a blank box.
   */
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const shell =
        shellRef.current?.getBoundingClientRect().height ??
        document.getElementById("root")?.getBoundingClientRect().height ??
        0;
      const overlap = Math.max(0, shell - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty(
        "--keyboard-overlap",
        overlap > 60 ? `${Math.round(overlap)}px` : "0px",
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (!saved) return;
    if (saved.state === "pending" || saved.state === "running") return;
    // "started" means the query went quiet, so there is no result to wait for.
    hideTimer.current = setTimeout(
      () => setSaved(null),
      saved.state === "successful" ? 12000 : 8000,
    );
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [saved]);

  const saveFile = async (path: string) => {
    clearTimers();
    const name = fileName(path);
    const result = await downloadFile(mentor.fileUrl(path, true), name);
    if (result.id === null) {
      setSaved({ id: null, name: result.filename, state: "successful" });
      return;
    }
    const id = result.id;
    setSaved({ id, name: result.filename, state: "running" });
    const started = Date.now();
    let misses = 0;
    const tick = async () => {
      const state = await downloadStatus(id);
      if (state === "successful" || state === "failed") {
        setSaved({ id, name: result.filename, state });
        return;
      }
      // The download is still going, or the query is unavailable for a moment.
      // Only the DownloadManager itself may call a download failed.
      if (state === "unknown") misses += 1;
      if (Date.now() - started > 120_000 || misses >= 6) {
        setSaved({ id, name: result.filename, state: "started" });
        return;
      }
      pollTimer.current = setTimeout(() => void tick(), 800);
    };
    pollTimer.current = setTimeout(() => void tick(), 800);
  };

  if (!mentor.connected) {
    return <ConnectScreen mentor={mentor} />;
  }

  // One button: on phones it opens the drawer, on tablet and desktop it folds the rail away.
  const toggleRail = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setRailCollapsed((value) => !value);
    } else {
      setRailOpen(true);
    }
  };

  const chatListButton = (
    <button
      type="button"
      onClick={toggleRail}
      aria-label="Chats"
      aria-expanded={!railCollapsed}
      title="Chats"
      className="chatcn-focus text-chatcn-fg shadow-chatcn-xs hover:bg-chatcn-fill-hover flex size-10 items-center justify-center rounded-full bg-chatcn-bg/65 backdrop-blur-md transition-[background-color,transform] duration-150 active:scale-95"
    >
      <PanelLeftIcon className="size-5" />
    </button>
  );

  return (
    <div
      ref={shellRef}
      className="bg-chatcn-bg text-chatcn-fg flex h-dvh min-h-0 overflow-hidden"
      onTouchStart={onSwipeStart}
      onTouchMove={onSwipeMove}
      onTouchEnd={endSwipe}
      onTouchCancel={endSwipe}
      style={{
        paddingTop: "var(--safe-top)",
        paddingBottom: "calc(var(--safe-bottom) + var(--keyboard-overlap, 0px))",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
      }}
    >
      {!railCollapsed ? (
        <aside data-testid="session-rail" className="hidden w-[272px] shrink-0 lg:block">
          <SessionRail mentor={mentor} onVoice={() => setVoiceSignal((n) => n + 1)} />
        </aside>
      ) : null}

      {railOpen || railDrag !== null ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          style={{
            opacity:
              railDrag === null
                ? 1
                : Math.min(1, Math.max(0, 1 + railDrag / (railWidth || 280))),
            pointerEvents:
              railDrag !== null && railDrag < -(railWidth || 280) * 0.95 ? "none" : undefined,
          }}
          onClick={() => setRailOpen(false)}
        />
      ) : null}
      <aside
        className={
          "bg-chatcn-bg fixed start-0 z-50 w-[280px] max-w-[85vw] lg:hidden " +
          (railDrag !== null
            ? "transition-none"
            : "transition-transform duration-200 " + (railOpen ? "translate-x-0" : "-translate-x-full"))
        }
        style={{
          top: "var(--safe-top)",
          bottom: "calc(var(--safe-bottom) + var(--keyboard-overlap, 0px))",
          transform: railDrag !== null ? `translateX(${railDrag}px)` : undefined,
        }}
      >
        <SessionRail
          mentor={mentor}
          onClose={() => setRailOpen(false)}
          onVoice={() => {
            setRailOpen(false);
            setVoiceSignal((n) => n + 1);
          }}
        />
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {mentor.chatError ? (
          <div className="border-chatcn-red-border bg-chatcn-red-bg flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <span className="chatcn-text-13 text-chatcn-red flex-1 text-pretty">
              {mentor.chatError}
            </span>
            <button
              type="button"
              onClick={mentor.clearChatError}
              aria-label="Dismiss error"
              className="chatcn-focus rounded-chatcn-sm text-chatcn-red flex size-6 items-center justify-center"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <MentorAgent
            messages={mentor.messages}
            status={mentor.status}
            actions={{ send: mentor.send, stop: mentor.stop }}
            leadingAction={chatListButton}
            onNewChat={() => void mentor.newSession()}
            emptyTitle="What should we work on?"
            emptyDescription="Ask about your notes, attach a PDF, or have me build a study guide, worksheet or script."
            suggestions={mentor.starters.map((label) => ({ label }))}
            onSuggestion={(prompt) => void mentor.send(prompt)}
            attachments={mentor.attachments}
            uploads={mentor.uploads}
            onAttachFiles={(files) => void mentor.attachFiles(files)}
            onRemoveAttachment={mentor.removeAttachment}
            fileUrl={mentor.fileUrl}
            onForkMessage={(message) => void mentor.forkMessage(message)}
            files={mentor.files}
            onOpenFile={(path) => void openFile(mentor.fileUrl(path))}
            onDownloadFile={(path) => void saveFile(path)}
            onRefreshFiles={() => void mentor.refreshFiles()}
            workspace={todos.length ? { todos } : undefined}
            onAnswerQuestions={mentor.answerQuestions}
            onTranscribe={mentor.transcribe}
            voiceSignal={voiceSignal}
            placeholder="Ask anything..."
            queuePlaceholder="Queue a message for when this run ends..."
            composerModel={mentor.activeModel?.name ?? mentor.model ?? "Model"}
            onOpenModels={() => setModelOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            thinkingEnabled={mentor.thinkingEnabled}
            canThink={mentor.canThink}
            onThinkingChange={mentor.setThinkingEnabled}
            searchEnabled={mentor.searchEnabled}
            onSearchChange={mentor.setSearchEnabled}
            draftKey={mentor.activeId ?? "new"}
          />
        </div>
      </main>

      {saved ? (
        <DownloadToast
          file={saved}
          onOpen={() => {
            if (saved.id === null) return;
            void openDownload(saved.id).catch((error) => {
              const note =
                error instanceof Error ? error.message : "No app could open this file.";
              setSaved((current) => (current ? { ...current, note } : current));
            });
          }}
          onDismiss={() => setSaved(null)}
        />
      ) : null}

      {modelOpen ? <ModelDialog mentor={mentor} onClose={() => setModelOpen(false)} /> : null}
      {settingsOpen ? (
        <SettingsDialog mentor={mentor} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </div>
  );
}