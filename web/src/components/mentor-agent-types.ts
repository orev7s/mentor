import * as React from "react"
import { type ToolRendererMap } from "@/components/ui/chatcn/tool-fallback"
import { type QueuedMessage } from "@/components/ui/chatcn/queued-messages"
import { type TodoItem } from "@/components/ui/chatcn/todo-list"
import { type DiffFile } from "@/lib/chatcn-diff"
import { type Attachment, type WorkspaceFile } from "@/lib/api"
import { type ChatcnActions, type ChatcnMessage } from "@/lib/chatcn-types"

/** Request status, identical to AI SDK `useChat().status`. */
export type CodingAgentStatus = "ready" | "submitted" | "streaming" | "error"

/** The workspace tabs. Files and changed files open in one sheet. */
export type CodingWorkspaceTab = "changes" | "files"

/** Everything the workspace shows, derived from the tool calls in the thread. */
export interface CodingWorkspace {
  /** One entry per path, edits to the same file merged in order. */
  files: DiffFile[]
  /** Paths whose edit is waiting on an approval. */
  pendingPaths: string[]
  /** Paths whose patch is still streaming in. */
  streamingPaths: string[]
  /** The latest todo list the agent wrote. */
  todos: TodoItem[]
  /**
   * What the agent touched last, so the workspace can follow it: a changing `key` moves to
   * `tab` (and selects `path` on Changes).
   */
  activity?: { key: string; tab: CodingWorkspaceTab; path?: string }
}

/** A multiple-choice question the agent sends through `ask_student`. */
export interface AskQuestionInput {
  question: string
  options: string[]
  allowMultiple?: boolean
}

export interface AskAnswerInput {
  question: string
  selected: string[]
}

export interface CodingAgentProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** The thread, in the chatcn contract. AI SDK `UIMessage` works as is. */
  messages: ChatcnMessage[]
  /** Same values as `useChat().status`. Defaults to `ready`. */
  status?: CodingAgentStatus
  /** send, stop, approve and deny. Missing ones hide their controls. */
  actions?: ChatcnActions

  /** A control at the top-left, usually the chat list button. */
  leadingAction?: React.ReactNode
  /** Opens a fresh chat from the floating top bar. */
  onNewChat?: () => void

  /** Model name shown in the overflow menu. */
  composerModel?: string
  /** Opens the model picker from the overflow menu. */
  onOpenModels?: () => void
  /** Opens providers and settings from the overflow menu. */
  onOpenSettings?: () => void
  /**
   * Where the composer draft is saved, usually the active session id. The draft is
   * restored when the student comes back, even after the app was killed.
   */
  draftKey?: string

  /** Override the derived workspace. Each key replaces only its own part. */
  workspace?: Partial<CodingWorkspace>
  /** Tool name to renderer. Defaults to every chatcn tool renderer plus `todo_write`. */
  toolRenderers?: ToolRendererMap

  /** Workspace tab. Controlled or uncontrolled. */
  workspaceTab?: CodingWorkspaceTab
  defaultWorkspaceTab?: CodingWorkspaceTab
  onWorkspaceTabChange?: (tab: CodingWorkspaceTab) => void

  /**
   * Messages sent while the agent works wait here and go out, joined, when the run ends.
   * Controlled or uncontrolled.
   */
  queue?: QueuedMessage[]
  defaultQueue?: QueuedMessage[]
  onQueueChange?: (queue: QueuedMessage[]) => void

  /** Composer placeholder while idle. */
  placeholder?: string
  /** Composer placeholder while the agent works. */
  queuePlaceholder?: string
  /** Thinking is on by default. Off sends thinkingLevel "off" to the server. */
  thinkingEnabled?: boolean
  /** False when the model has no non-thinking mode, which hides the Think control. */
  canThink?: boolean
  onThinkingChange?: (enabled: boolean) => void
  /** Search is on by default. Off removes web_search and web_fetch from the session. */
  searchEnabled?: boolean
  onSearchChange?: (enabled: boolean) => void
  emptyTitle?: React.ReactNode
  emptyDescription?: React.ReactNode

  /** Files the student attached but has not sent yet. */
  attachments?: Attachment[]
  /** Files still uploading. Shown as placeholders and Send waits for them. */
  uploads?: { id: string; name: string }[]
  /** Files from the attach button, paste or drop. */
  onAttachFiles?: (files: File[]) => void
  onRemoveAttachment?: (path: string) => void
  /** Builds the URL a workspace file is served from. Used for thumbnails and previews. */
  fileUrl?: (path: string) => string

  /** Branch the conversation at a message, seeding a new chat with the turns before it. */
  onForkMessage?: (message: ChatcnMessage) => void

  /** Everything in the session workspace: uploads plus anything the agent wrote. */
  files?: WorkspaceFile[]
  onOpenFile?: (path: string) => void
  onDownloadFile?: (path: string) => void
  onRefreshFiles?: () => void

  /** Send the student's answers back to a waiting `ask_student` call. */
  onAnswerQuestions?: (
    toolCallId: string,
    answers: AskAnswerInput[],
  ) => void | Promise<void>

  /**
   * Transcribe a recorded clip to text. Supplied by the app so the provider key stays on the
   * server. When missing, the voice buttons are hidden.
   */
  onTranscribe?: (audio: Blob, language?: string) => Promise<string>

  /** Bumping this starts a voice recording, so the sidebar button can drive the composer. */
  voiceSignal?: number

  /** Starter prompts on the first screen. Up to four. */
  suggestions?: { label: string; prompt?: string }[]
  onSuggestion?: (prompt: string) => void

  /** Fill the viewport. Otherwise the block fills its parent: give the parent a height. */
  fullHeight?: boolean
}
