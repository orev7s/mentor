import { useMemo, useState } from "react";
import { useMentor } from "@/hooks/use-mentor";
import { ConnectScreen } from "@/components/ConnectScreen";
import { SessionRail } from "@/components/SessionRail";
import { ModelDialog } from "@/components/ModelDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { MentorAgent, todosFrom } from "@/components/mentor-agent";
import type { TodoItem } from "@/components/ui/chatcn/todo-list";
import { PanelLeftIcon, XIcon } from "@/lib/chatcn-icons";
import { getToolName, isToolPart, type ChatcnMessage } from "@/lib/chatcn-types";
import { downloadFile, fileName, openFile } from "@/lib/files";

const TODO_TOOLS = new Set(["todo_write", "todowrite", "write_todos", "update_todos"]);

/**
 * The model sometimes sends only the item it just finished instead of the whole list.
 * Merge every todo update by title so the pinned plan keeps all of its steps.
 */
function mergedTodos(messages: ChatcnMessage[]): TodoItem[] {
  const byTitle = new Map<string, TodoItem>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolPart(part) || !TODO_TOOLS.has(getToolName(part))) continue;
      for (const item of todosFrom(part.input)) byTitle.set(item.title, item);
    }
  }
  return [...byTitle.values()];
}

export default function App() {
  const mentor = useMentor();
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const todos = useMemo(() => mergedTodos(mentor.messages), [mentor.messages]);

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

  const headerActions = (
    <button
      type="button"
      onClick={toggleRail}
      aria-label="Chats"
      aria-expanded={!railCollapsed}
      title="Chats"
      className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex size-9 items-center justify-center transition-colors"
    >
      <PanelLeftIcon className="size-4" />
    </button>
  );

  return (
    <div className="bg-chatcn-bg text-chatcn-fg flex h-dvh min-h-0 overflow-hidden">
      {!railCollapsed ? (
        <aside data-testid="session-rail" className="hidden w-[272px] shrink-0 lg:block">
          <SessionRail mentor={mentor} />
        </aside>
      ) : null}

      {railOpen ? (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setRailOpen(false)} />
      ) : null}
      <aside
        className={
          "bg-chatcn-bg fixed inset-y-0 start-0 z-50 w-[280px] max-w-[85vw] transition-transform duration-200 lg:hidden " +
          (railOpen ? "translate-x-0" : "-translate-x-full")
        }
      >
        <SessionRail mentor={mentor} onClose={() => setRailOpen(false)} />
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
            title={mentor.activeSession?.title ?? "New chat"}
            headerActions={headerActions}
            emptyTitle="What should we work on?"
            emptyDescription="Ask about your notes, attach a PDF, or have me build a study guide, worksheet or script."
            suggestions={mentor.starters.map((label) => ({ label }))}
            onSuggestion={(prompt) => void mentor.send(prompt)}
            attachments={mentor.attachments}
            onAttachFiles={(files) => void mentor.attachFiles(files)}
            onRemoveAttachment={mentor.removeAttachment}
            files={mentor.files}
            onOpenFile={(path) => void openFile(mentor.fileUrl(path))}
            onDownloadFile={(path) =>
              void downloadFile(mentor.fileUrl(path, true), fileName(path))
            }
            onRefreshFiles={() => void mentor.refreshFiles()}
            workspace={todos.length ? { todos } : undefined}
            permissionModes={[]}
            context={
              mentor.activeModel?.contextWindow
                ? {
                    limit: mentor.activeModel.contextWindow,
                    used: mentor.tokensUsed,
                    model: mentor.activeModel.name,
                  }
                : undefined
            }
            placeholder="Ask anything..."
            queuePlaceholder="Queue a message for when this run ends..."
            composerModel={mentor.activeModel?.name ?? mentor.model ?? "Model"}
            onOpenModels={() => setModelOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
      </main>

      {modelOpen ? <ModelDialog mentor={mentor} onClose={() => setModelOpen(false)} /> : null}
      {settingsOpen ? (
        <SettingsDialog mentor={mentor} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </div>
  );
}