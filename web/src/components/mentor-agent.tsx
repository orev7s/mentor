"use client"

import * as React from "react"
import {
  Conversation,
  ConversationContent,
} from "@/components/ui/chatcn/conversation"
import { EmptyState } from "@/components/ui/chatcn/empty-state"
import { FilePreviewDialog } from "@/components/ui/chatcn/file-preview"
import { ImageLightbox } from "@/components/ui/chatcn/image"
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "@/components/ui/chatcn/menu"
import { PromptInputBox } from "@/components/ui/ai-prompt-box"
import { QueuedMessages } from "@/components/ui/chatcn/queued-messages"
import { ScrollToBottom } from "@/components/ui/chatcn/scroll-to-bottom"
import { TodoList } from "@/components/ui/chatcn/todo-list"
import { TooltipProvider } from "@/components/ui/chatcn/tooltip"
import {
  DiffIcon,
  EllipsisIcon,
  FolderIcon,
  MicIcon,
  MicOffIcon,
  ModelIcon,
  RefreshCwIcon,
  SettingsIcon,
  SquarePenIcon,
  XIcon,
} from "@/lib/chatcn-icons"
import { type ChatcnMessage } from "@/lib/chatcn-types"
import { type Attachment } from "@/lib/api"
import { checkForUpdateNow } from "@/lib/updater"
import { type Recording, speak, speechSupported, startRecording, stopSpeaking } from "@/lib/voice"
import { useBackHandler } from "@/lib/back"
import { cn } from "@/lib/utils"
import { codingWorkspaceFromMessages } from "./mentor-workspace"
import { type CodingAgentProps, type CodingWorkspace, type CodingWorkspaceTab } from "./mentor-agent-types"
import { PartContext, defaultToolRenderers, type PartContextValue } from "./mentor-agent-shared"
import { AgentMessage, WorkingRow, messageText } from "./mentor-thread"
import { ChangesView, FilesView } from "./mentor-workspace-views"
import {
  ATTACH_ACCEPT,
  AttachmentCards,
  AttachmentMenuButton,
  isImageAttachment,
} from "./mentor-attachments"

/* -------------------------------------------------------------------------------------------------
 * Layout helpers
 * -----------------------------------------------------------------------------------------------*/

function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void) {
  const [state, setState] = React.useState(defaultValue)
  const current = value ?? state
  const set = React.useCallback(
    (next: T) => {
      if (value === undefined) setState(next)
      onChange?.(next)
    },
    [value, onChange],
  )
  return [current, set] as const
}

/* -------------------------------------------------------------------------------------------------
 * CodingAgent
 * -----------------------------------------------------------------------------------------------*/

let queueSeq = 0

/**
 * A quiet tutor chat, built to look like the chat apps students already use.
 * The thread fills the screen and the composer sits at the bottom. There is no
 * top bar and no tab strip: a floating chat-list button, a compose button and
 * one overflow menu hold everything else. Files, changes and the terminal open
 * as a sheet over the chat, only when the student asks for them.
 */
function MentorAgent({
  messages,
  status = "ready",
  actions = {},
  leadingAction,
  onNewChat,
  composerModel,
  onOpenModels,
  onOpenSettings,
  draftKey = "default",
  workspace: workspaceProp,
  toolRenderers = defaultToolRenderers,
  workspaceTab: tabProp,
  defaultWorkspaceTab = "files",
  onWorkspaceTabChange,
  queue: queueProp,
  defaultQueue = [],
  onQueueChange,
  placeholder = "Ask anything...",
  queuePlaceholder = "Queue a message for when this run ends...",
  thinkingEnabled = true,
  canThink = false,
  onThinkingChange,
  searchEnabled = true,
  onSearchChange,
  emptyTitle = "What should we work on?",
  emptyDescription,
  attachments = [],
  uploads = [],
  onAttachFiles,
  onRemoveAttachment,
  fileUrl,
  onForkMessage,
  files: workspaceFiles = [],
  onOpenFile,
  onDownloadFile,
  onRefreshFiles,
  onAnswerQuestions,
  onTranscribe,
  voiceSignal,
  suggestions,
  onSuggestion,
  fullHeight = false,
  className,
  ...props
}: CodingAgentProps) {
  const busy = status === "submitted" || status === "streaming"
  const uploading = uploads.length > 0
  const derived = React.useMemo(() => codingWorkspaceFromMessages(messages), [messages])
  const workspace: CodingWorkspace = { ...derived, ...workspaceProp }
  const { files, todos } = workspace

  const [, setTab] = useControllable(tabProp, defaultWorkspaceTab, onWorkspaceTabChange)
  const [view, setView] = React.useState<CodingWorkspaceTab | null>(null)
  // Android back closes the workspace sheet before it leaves the app.
  useBackHandler(Boolean(view), () => setView(null))
  const [selected, setSelected] = React.useState<string | null>(null)
  // A workspace file opened in the in-app viewer, and the image pager for pending uploads.
  const [previewPath, setPreviewPath] = React.useState<string | null>(null)
  const [lightbox, setLightbox] = React.useState<number | null>(null)
  // Result of a manual update check, shown as a short pill under the top bar.
  const [updateNotice, setUpdateNotice] = React.useState<string | null>(null)
  const updateNoticeTimer = React.useRef<number | undefined>(undefined)
  const flashUpdateNotice = React.useCallback((message: string, autoHideMs = 6000) => {
    setUpdateNotice(message)
    window.clearTimeout(updateNoticeTimer.current)
    if (autoHideMs > 0) {
      updateNoticeTimer.current = window.setTimeout(() => setUpdateNotice(null), autoHideMs)
    }
  }, [])
  React.useEffect(() => () => window.clearTimeout(updateNoticeTimer.current), [])
  const [queue, setQueue] = useControllable(queueProp, defaultQueue, onQueueChange)
  const [input, setInput] = React.useState("")
  // Keep the latest draft in a ref so voice transcription and submit can build on
  // it without a stale closure.
  const inputRef = React.useRef("")
  inputRef.current = input
  const writeDraft = React.useCallback((value: string) => {
    try {
      const key = `mentor.draft:${draftKey}`
      if (value) window.localStorage.setItem(key, value)
      else window.localStorage.removeItem(key)
    } catch {
      // storage may be unavailable; the draft just will not survive a restart
    }
  }, [draftKey])
  const setDraft = React.useCallback(
    (value: string) => {
      setInput(value)
      writeDraft(value)
    },
    [writeDraft],
  )
  // Load the draft for this chat when it changes; typing persisted it already.
  React.useEffect(() => {
    let saved = ""
    try {
      saved = window.localStorage.getItem(`mentor.draft:${draftKey}`) ?? ""
    } catch {
      saved = ""
    }
    setInput(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])
  const [stopped, setStopped] = React.useState<ReadonlySet<string>>(() => new Set())
  // Voice input: recording, then transcribing. `voiceError` shows in the listening bar.
  const [voice, setVoice] = React.useState<"idle" | "recording" | "transcribing">("idle")
  const [voiceError, setVoiceError] = React.useState<string | null>(null)
  const recordingRef = React.useRef<Recording | null>(null)
  const canVoice = Boolean(onTranscribe)
  // Read aloud: the id of the message being spoken.
  const [speaking, setSpeaking] = React.useState<string | null>(null)
  // When the current run began, for the working row. Held while the run is in flight.
  const [runStartedAt, setRunStartedAt] = React.useState<number | undefined>(undefined)
  React.useEffect(() => {
    if (busy) setRunStartedAt((at) => at ?? Date.now())
    else setRunStartedAt(undefined)
  }, [busy])

  // Remember what the agent touched last, so the sheet opens on the right view.
  // It never opens by itself: a sheet that appears while the student reads is noise.
  const activityKey = workspace.activity?.key
  const activityRef = React.useRef(workspace.activity)
  activityRef.current = workspace.activity
  React.useEffect(() => {
    const activity = activityRef.current
    if (!activityKey || !activity) return
    setTab(activity.tab)
    if (activity.path) setSelected(activity.path)
  }, [activityKey, setTab])

  // When a run ends, everything queued goes out as the next message. The rows stay, marked as
  // sending, until that message shows up in the thread, so the hand-off reads as one motion.
  const wasBusy = React.useRef(busy)
  const queueRef = React.useRef(queue)
  queueRef.current = queue
  const [sentAt, setSentAt] = React.useState<number | null>(null)
  React.useEffect(() => {
    const ended = wasBusy.current && !busy
    wasBusy.current = busy
    if (!ended || status === "error" || !actions.send) return
    const due = queueRef.current.filter((m) => m.status !== "failed" && m.status !== "sending")
    if (!due.length) return
    const ids = new Set(due.map((m) => m.id))
    setSentAt(messages.length)
    setQueue(queueRef.current.map((m) => (ids.has(m.id) ? { ...m, status: "sending" } : m)))
    void actions.send(due.map((m) => m.text).join("\n\n"))
  }, [busy, status, actions, setQueue, messages.length])

  // Clear the sent rows once the thread has the new message, or after 4 s at the latest.
  React.useEffect(() => {
    if (sentAt === null) return
    const clear = () => {
      setSentAt(null)
      setQueue(queueRef.current.filter((m) => m.status !== "sending"))
    }
    if (messages.length > sentAt) {
      clear()
      return
    }
    const id = window.setTimeout(clear, 4000)
    return () => window.clearTimeout(id)
  }, [sentAt, messages.length, setQueue])

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (uploading) return
    if ((!trimmed && attachments.length === 0) || !actions.send) return
    setDraft("")
    if (busy) {
      setQueue([...queue, { id: `queued-${++queueSeq}`, text: trimmed, mode: "after-run" }])
      return
    }
    void actions.send(trimmed)
  }

  const stop = () => {
    const lastMessage = messages.at(-1)
    if (lastMessage?.role === "assistant") setStopped((set) => new Set(set).add(lastMessage.id))
    actions.stop?.()
  }

  const checkUpdates = React.useCallback(async () => {
    flashUpdateNotice("Checking for updates...", 0)
    const result = await checkForUpdateNow()
    // "updated" reloads the app, so this line is only seen for a moment.
    flashUpdateNotice(result.message, result.status === "updated" ? 4000 : 6000)
  }, [flashUpdateNotice])

  const beginVoice = React.useCallback(async () => {
    if (!onTranscribe) return
    setVoiceError(null)
    if (recordingRef.current) return
    try {
      const recording = startRecording()
      recordingRef.current = recording
      setVoice("recording")
      await recording.started
    } catch {
      recordingRef.current = null
      setVoice("idle")
      setVoiceError("Microphone access is needed for voice input.")
    }
  }, [onTranscribe])

  const finishVoice = React.useCallback(
    async (keep: boolean) => {
      const recording = recordingRef.current
      if (!recording) return
      recordingRef.current = null
      try {
        const clip = await recording.stop()
        if (!keep) {
          setVoice("idle")
          return
        }
        setVoice("transcribing")
        const text = await onTranscribe?.(clip)
        if (text) {
          const next = inputRef.current ? `${inputRef.current} ${text}` : text
          setDraft(next)
        }
        setVoice("idle")
      } catch (cause) {
        setVoice("idle")
        setVoiceError(cause instanceof Error ? cause.message : "Could not transcribe that.")
      }
    },
    [onTranscribe],
  )

  const toggleVoice = React.useCallback(() => {
    if (voice === "recording") void finishVoice(true)
    else if (voice === "idle") void beginVoice()
  }, [voice, beginVoice, finishVoice])

  // The sidebar voice button bumps `voiceSignal`; start listening when it changes.
  const lastVoiceSignal = React.useRef(voiceSignal)
  React.useEffect(() => {
    if (voiceSignal === undefined || voiceSignal === lastVoiceSignal.current) return
    lastVoiceSignal.current = voiceSignal
    void beginVoice()
  }, [voiceSignal, beginVoice])

  React.useEffect(
    () => () => {
      recordingRef.current?.cancel()
      stopSpeaking()
    },
    [],
  )

  const toggleSpeak = React.useCallback(
    (message: ChatcnMessage) => {
      if (speaking === message.id) {
        stopSpeaking()
        setSpeaking(null)
        return
      }
      const text = messageText(message)
      if (!text) return
      const started = speak(text, {
        onStart: () => setSpeaking(message.id),
        onEnd: () => setSpeaking((current) => (current === message.id ? null : current)),
      })
      if (!started) setSpeaking(null)
    },
    [speaking],
  )

  const openView = (next: CodingWorkspaceTab) => {
    setTab(next)
    setView(next)
  }
  const pickFile = (path: string) => {
    setSelected(path)
  }

  // Pending image attachments, for the pager opened from a thumbnail.
  const pendingImages = React.useMemo(
    () => attachments.filter((file) => isImageAttachment(file.name)),
    [attachments],
  )
  const previewImage = (file: Attachment) => {
    const index = pendingImages.findIndex((item) => item.path === file.path)
    setLightbox(index >= 0 ? index : 0)
  }

  const partContext = React.useMemo<PartContextValue>(
    () => ({
      renderers: toolRenderers,
      approve: actions.approve,
      deny: actions.deny,
      split: true,
      onOpenFile: (path) => setPreviewPath(path),
      onDownloadFile,
      onAnswerQuestions,
    }),
    [toolRenderers, actions.approve, actions.deny, onDownloadFile, onAnswerQuestions],
  )

  React.useEffect(() => {
    if (!view) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault()
        setView(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [view])

  // Move focus into the sheet so keyboard and screen reader users land in it,
  // and hand it back to the menu button when the sheet closes.
  const sheetCloseRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (!view) return
    const previous = document.activeElement as HTMLElement | null
    sheetCloseRef.current?.focus()
    return () => previous?.focus?.()
  }, [view])

  const last = messages.at(-1)
  const liveId = busy && last?.role === "assistant" ? last.id : undefined

  const thread =
    messages.length === 0 ? (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        suggestions={suggestions}
        onSuggestion={(prompt) => {
          if (onSuggestion) onSuggestion(prompt)
          else submit(prompt)
        }}
        className="flex-1 justify-center py-8"
      />
    ) : (
      <Conversation className="min-h-0 flex-1">
        <ConversationContent
          label="Agent session"
          className="gap-7 px-4 pt-16 pb-6 @3xl/coding-agent:px-6"
          viewportClassName="[mask-image:linear-gradient(to_bottom,transparent,black_20px)]"
        >
          {messages.map((message, i) => (
            <AgentMessage
              key={message.id}
              message={message}
              streaming={message.id === liveId}
              stopped={stopped.has(message.id)}
              latest={i === messages.length - 1}
              onFork={onForkMessage}
              onSpeak={speechSupported() ? toggleSpeak : undefined}
              speaking={speaking === message.id}
            />
          ))}
          {busy ? <WorkingRow messages={messages} startedAt={runStartedAt} /> : null}
        </ConversationContent>
        <ScrollToBottom />
      </Conversation>
    )

  const composer = (
    <div
      data-slot="coding-agent-composer"
      className="mx-auto flex w-full max-w-[720px] shrink-0 flex-col gap-2 px-3 pb-3 @3xl/coding-agent:px-4 @3xl/coding-agent:pb-4"
    >
      {todos.length ? <TodoList items={todos} collapsible defaultOpen={false} /> : null}
      {queue.length ? <QueuedMessages items={queue} onItemsChange={setQueue} /> : null}
      {voice !== "idle" || voiceError ? (
        <div
          data-slot="voice-status"
          role="status"
          className="border-chatcn-border bg-chatcn-surface flex min-h-11 items-center gap-2.5 rounded-chatcn-lg border px-3 py-2"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 shrink-0 rounded-full",
              voice === "recording" ? "bg-chatcn-red animate-pulse" : "bg-chatcn-fg-subtle",
            )}
          />
          <span
            className={cn(
              "chatcn-text-13 text-chatcn-fg min-w-0 flex-1",
              voiceError ? "text-pretty" : "truncate",
            )}
          >
            {voiceError ??
              (voice === "recording" ? "Listening..." : "Transcribing...")}
          </span>
          {voice === "recording" ? (
            <>
              <button
                type="button"
                onClick={() => void finishVoice(false)}
                className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg chatcn-text-12 flex h-8 shrink-0 items-center px-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void finishVoice(true)}
                data-testid="voice-done"
                className="chatcn-focus bg-chatcn-primary text-chatcn-primary-fg hover:bg-chatcn-primary-hover chatcn-text-12 flex h-8 shrink-0 items-center rounded-full px-3 font-medium"
              >
                Done
              </button>
            </>
          ) : voiceError ? (
            <button
              type="button"
              onClick={() => setVoiceError(null)}
              aria-label="Dismiss"
              className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-subtle hover:text-chatcn-fg flex size-7 shrink-0 items-center justify-center"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
      <PromptInputBox
        value={input}
        onValueChange={setDraft}
        onSend={(text) => submit(text)}
        onStop={stop}
        isLoading={busy}
        disabled={!actions.send}
        placeholder={busy ? queuePlaceholder : placeholder}
        hasContent={attachments.length > 0 || uploading}
        uploading={uploading}
        thinking={thinkingEnabled}
        canThink={canThink}
        onThinkingChange={onThinkingChange}
        search={searchEnabled}
        onSearchChange={onSearchChange}
        accept={ATTACH_ACCEPT}
        renderAttach={() => (
          <AttachmentMenuButton
            disabled={!actions.send}
            accept={ATTACH_ACCEPT}
            onFiles={(incoming) => onAttachFiles?.(incoming)}
          />
        )}
        recording={voice === "recording"}
        canVoice={canVoice}
        onVoice={toggleVoice}
        attachments={
          attachments.length || uploads.length ? (
            <AttachmentCards
              attachments={attachments}
              uploads={uploads}
              fileUrl={fileUrl}
              onRemove={(path) => onRemoveAttachment?.(path)}
              onPreviewImage={previewImage}
              onPreviewFile={(file) => setPreviewPath(file.path)}
            />
          ) : null
        }
      />
    </div>
  )

  const viewLabel = view === "files" ? "Files" : view === "changes" ? "Changes" : ""

  const previewFile = previewPath
    ? (workspaceFiles.find((file) => file.path === previewPath) ??
      attachments.find((file) => file.path === previewPath))
    : undefined
  const previewUrl =
    previewPath && fileUrl
      ? fileUrl(
          attachments.find((file) => file.path === previewPath)?.previewPath ?? previewPath,
        )
      : undefined
  const lightboxImages = pendingImages.map((file) => ({
    src: fileUrl?.(file.previewPath ?? file.path) ?? "",
    // A preview can fail on the phone (a format the WebView cannot decode); the
    // original is the last chance to show something instead of a blank stage.
    fallbackSrc:
      file.previewPath && fileUrl ? fileUrl(file.path) : undefined,
    alt: file.name,
    filename: file.name,
  }))

  const panel = (which: CodingWorkspaceTab) => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {which === "files" ? (
        <FilesView
          files={workspaceFiles}
          onOpen={setPreviewPath}
          onDownload={onDownloadFile}
          onRefresh={onRefreshFiles}
        />
      ) : (
        <ChangesView workspace={workspace} selected={selected} onSelect={pickFile} />
      )}
    </div>
  )

  const floatingButton =
    "chatcn-focus flex size-10 shrink-0 items-center justify-center rounded-full " +
    "bg-chatcn-bg/65 text-chatcn-fg shadow-chatcn-xs backdrop-blur-md " +
    "hover:bg-chatcn-fill-hover active:scale-95 transition-[background-color,transform] duration-150"

  const topBar = (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-2 py-1.5">
      <div className="pointer-events-auto">{leadingAction}</div>
      <div className="pointer-events-auto flex items-center gap-1">
        {canVoice ? (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={voice === "recording" ? "Stop recording" : "Voice input"}
            title={voice === "recording" ? "Stop recording" : "Voice input"}
            data-testid="voice-top"
            className={cn(floatingButton, voice === "recording" && "text-chatcn-red")}
          >
            {voice === "recording" ? (
              <MicOffIcon className="size-5" />
            ) : (
              <MicIcon className="size-5" />
            )}
          </button>
        ) : null}
        {onNewChat ? (
          <button
            type="button"
            onClick={onNewChat}
            aria-label="New chat"
            title="New chat"
            data-testid="new-chat-top"
            className={floatingButton}
          >
            <SquarePenIcon className="size-5" />
          </button>
        ) : null}
        <Menu>
          <MenuTrigger aria-label="More options" title="More options" className={floatingButton}>
            <EllipsisIcon className="size-5" />
          </MenuTrigger>
          <MenuContent side="bottom" align="end" sideOffset={8} className="min-w-56">
            <MenuGroup>
              <MenuLabel>Workspace</MenuLabel>
              <MenuItem onClick={() => openView("files")} data-testid="menu-files">
                <FolderIcon />
                Files
                {workspaceFiles.length ? (
                  <MenuShortcut>{workspaceFiles.length}</MenuShortcut>
                ) : null}
              </MenuItem>
              {files.length ? (
                <MenuItem onClick={() => openView("changes")} data-testid="menu-changes">
                  <DiffIcon />
                  Changes
                  <MenuShortcut>{files.length}</MenuShortcut>
                </MenuItem>
              ) : null}
            </MenuGroup>
            {onOpenModels || onOpenSettings ? <MenuSeparator /> : null}
            {onOpenModels ? (
              <MenuItem onClick={onOpenModels} data-testid="menu-model">
                <ModelIcon />
                Model
                <MenuShortcut className="max-w-32 truncate">{composerModel ?? "Change"}</MenuShortcut>
              </MenuItem>
            ) : null}
            {onOpenSettings ? (
              <MenuItem onClick={onOpenSettings} data-testid="menu-settings">
                <SettingsIcon />
                Settings
              </MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem onClick={() => void checkUpdates()} data-testid="menu-update">
              <RefreshCwIcon />
              Check for updates
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </div>
  )

  return (
    <TooltipProvider>
      <PartContext.Provider value={partContext}>
        <div
          data-slot="coding-agent"
          data-chat-status={status}
          className={cn(
            "bg-chatcn-bg text-chatcn-fg relative flex min-h-0 w-full min-w-0 flex-col overflow-hidden",
            fullHeight ? "h-dvh" : "h-full",
            className,
          )}
          {...props}
        >
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              aria-hidden="true"
              className="from-chatcn-bg via-chatcn-bg/80 pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-gradient-to-b to-transparent"
            />
            {topBar}
            {updateNotice ? (
              <div
                data-slot="update-notice"
                role="status"
                className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center px-4"
              >
                <span className="bg-chatcn-card text-chatcn-fg shadow-chatcn-lg border-chatcn-border rounded-full border px-3 py-1.5 text-center text-[0.8125rem] font-medium">
                  {updateNotice}
                </span>
              </div>
            ) : null}
            {thread}
            {composer}
          </div>

          {view ? (
            <>
              <div
                className="bg-chatcn-scrim absolute inset-0 z-40"
                onClick={() => setView(null)}
                aria-hidden="true"
              />
              <section
                role="dialog"
                aria-modal="true"
                aria-label={viewLabel}
                data-slot="workspace-sheet"
                className={cn(
                  "bg-chatcn-surface border-chatcn-border shadow-chatcn-xl absolute inset-x-0 bottom-0 top-14 z-50 flex flex-col overflow-hidden rounded-t-chatcn-xl border-t",
                  "sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(480px,92vw)] sm:rounded-none sm:border-s sm:border-t-0",
                )}
              >
                <div className="border-chatcn-border flex h-12 shrink-0 items-center gap-2 border-b px-3">
                  <h2 className="chatcn-text-14 text-chatcn-fg min-w-0 flex-1 truncate font-medium">
                    {viewLabel}
                  </h2>
                  <button
                    type="button"
                    ref={sheetCloseRef}
                    onClick={() => setView(null)}
                    aria-label="Close"
                    className="chatcn-focus text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg rounded-chatcn-sm flex size-8 items-center justify-center"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
                {panel(view)}
              </section>
            </>
          ) : null}

          {previewPath && previewUrl ? (
            <FilePreviewDialog
              open
              onOpenChange={(open) => {
                if (!open) setPreviewPath(null)
              }}
              path={previewPath}
              url={previewUrl}
              size={previewFile?.size}
              onDownload={onDownloadFile}
              onOpenExternal={onOpenFile}
            />
          ) : null}

          {lightbox !== null && fileUrl && lightboxImages.length ? (
            <ImageLightbox
              images={lightboxImages}
              index={lightbox}
              onIndexChange={setLightbox}
              open
              onOpenChange={(open) => {
                if (!open) setLightbox(null)
              }}
            />
          ) : null}
        </div>
      </PartContext.Provider>
    </TooltipProvider>
  )
}

export type {
  CodingAgentProps as MentorAgentProps,
  CodingAgentStatus as MentorAgentStatus,
  CodingWorkspace,
  CodingWorkspaceTab,
} from "./mentor-agent-types"
export { codingWorkspaceFromMessages, todosFrom } from "./mentor-workspace"
export { ToolTodoWritePart } from "./mentor-agent-shared"
export { MentorAgent }
