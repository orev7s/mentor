import * as React from "react"
import { ChangedFiles } from "@/components/ui/chatcn/changed-files"
import { DiffViewer } from "@/components/ui/chatcn/diff-viewer"
import { type ChatcnPart } from "@/lib/chatcn-types"
import { formatBytes, type WorkspaceFile } from "@/lib/api"
import {
  ArtifactIcon,
  DownloadIcon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  RefreshCwIcon,
} from "@/lib/chatcn-icons"
import { PartContext } from "./mentor-agent-shared"
import { type CodingWorkspace } from "./mentor-agent-types"

function QuietEmpty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <p className="chatcn-text-14 text-chatcn-fg font-medium">{title}</p>
      <p className="chatcn-text-13 text-chatcn-fg-subtle max-w-64 text-pretty">{children}</p>
    </div>
  )
}

function ChangesView({
  workspace,
  selected,
  onSelect,
}: {
  workspace: CodingWorkspace
  selected: string | null
  onSelect: (path: string) => void
}) {
  const { files, streamingPaths, pendingPaths } = workspace
  const file = files.find((f) => f.path === selected) ?? files.at(-1)
  if (!file) {
    return (
      <QuietEmpty title="No changes yet">
        Edits the agent makes land here as diffs you can read before you commit.
      </QuietEmpty>
    )
  }
  const pending = pendingPaths.includes(file.path)
  return (
    <div className="@container/changes flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col @2xl/changes:flex-row">
        <div className="border-chatcn-border chatcn-scroll flex max-h-[38%] shrink-0 flex-col overflow-y-auto border-b p-2 @2xl/changes:max-h-none @2xl/changes:w-80 @2xl/changes:border-e @2xl/changes:border-b-0">
          <ChangedFiles
            files={files.map(({ path, oldPath, status, additions, deletions }) => ({
              path,
              oldPath,
              status,
              additions,
              deletions,
            }))}
            value={file.path}
            onValueChange={onSelect}
            title={null}
          />
        </div>
        <div className="chatcn-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {pending ? (
            <p className="chatcn-text-12 text-chatcn-fg-muted border-chatcn-border flex h-9 shrink-0 items-center gap-2 border-b px-4">
              <span
                className="bg-chatcn-fg-subtle size-1.5 shrink-0 rounded-full"
                aria-hidden="true"
              />
              Waiting for your approval in the chat
            </p>
          ) : null}
          <DiffViewer
            key={file.path}
            file={file}
            streaming={streamingPaths.includes(file.path)}
            variant="plain"
            className="min-w-0"
          />
        </div>
      </div>
    </div>
  )
}

function reportIcon(kind: WorkspaceFile["kind"]) {
  if (kind === "pdf" || kind === "document") return <FileTextIcon />
  if (kind === "image") return <ImageIcon />
  if (kind === "code") return <FileCodeIcon />
  return <FileIcon />
}

/** The workspace as a file list: uploads, generated PDFs, notes, scripts and images. */
function FilesView({
  files,
  onOpen,
  onDownload,
  onRefresh,
}: {
  files: WorkspaceFile[]
  onOpen?: (path: string) => void
  onDownload?: (path: string) => void
  onRefresh?: () => void
}) {
  if (!files.length) {
    return (
      <QuietEmpty title="No files yet">
        Uploads and anything the agent writes land here: PDFs, notes, worksheets and scripts.
      </QuietEmpty>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-chatcn-border flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="chatcn-text-12 text-chatcn-fg-subtle">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <div className="flex-1" />
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-subtle hover:text-chatcn-fg ease-chatcn-standard flex h-7 items-center gap-1 px-1.5 transition-colors duration-150"
          >
            <RefreshCwIcon className="size-3.5" />
            Refresh
          </button>
        ) : null}
      </div>
      <ul className="chatcn-scroll m-0 flex-1 list-none overflow-y-auto p-2">
        {files.map((file) => (
          <li key={file.path}>
            <div className="group hover:bg-chatcn-fill-hover rounded-chatcn-md flex min-w-0 items-center gap-2 px-2 py-1.5">
              <span className="text-chatcn-fg-subtle shrink-0 [&_svg]:size-4">
                {reportIcon(file.kind)}
              </span>
              <button
                type="button"
                onClick={() => onOpen?.(file.path)}
                className="chatcn-focus flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start"
                title={file.path}
              >
                <span className="chatcn-text-13 text-chatcn-fg w-full truncate font-medium">
                  {file.path}
                </span>
                <span className="chatcn-text-12 text-chatcn-fg-subtle tabular-nums">
                  {formatBytes(file.size)} · {new Date(file.mtime).toLocaleDateString()}
                </span>
              </button>
              {onDownload ? (
                <button
                  type="button"
                  onClick={() => onDownload(file.path)}
                  aria-label={`Download ${file.path}`}
                  className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-subtle hover:text-chatcn-fg flex size-7 shrink-0 items-center justify-center opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <DownloadIcon className="size-3.5" />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The files a run produced, shown at the end of the reply with a download on each. */
function RunArtifacts({
  files,
  onOpen,
  onDownload,
}: {
  files: WorkspaceFile[]
  onOpen?: (path: string) => void
  onDownload?: (path: string) => void
}) {
  return (
    <div
      data-slot="run-artifacts"
      className="border-chatcn-border bg-chatcn-bg-subtle rounded-chatcn-lg overflow-hidden border"
    >
      <div className="border-chatcn-border flex h-9 items-center gap-2 border-b px-3">
        <ArtifactIcon className="text-chatcn-fg-subtle size-3.5 shrink-0" />
        <span className="chatcn-text-13 text-chatcn-fg font-medium">
          {files.length === 1 ? "1 file from this run" : `${files.length} files from this run`}
        </span>
      </div>
      <ul className="m-0 list-none divide-y divide-chatcn-border p-0">
        {files.map((file) => (
          <li key={file.path} className="flex min-w-0 items-center gap-2 px-3 py-2">
            <span className="text-chatcn-fg-subtle shrink-0 [&_svg]:size-4">
              {reportIcon(file.kind)}
            </span>
            <button
              type="button"
              onClick={() => onOpen?.(file.path)}
              className="chatcn-focus flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start"
            >
              <span className="chatcn-text-13 text-chatcn-fg w-full truncate font-medium">
                {file.path}
              </span>
              <span className="chatcn-text-12 text-chatcn-fg-subtle">
                {formatBytes(file.size)}
              </span>
            </button>
            {onDownload ? (
              <button
                type="button"
                onClick={() => onDownload(file.path)}
                className="chatcn-focus border-chatcn-border text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg rounded-chatcn-sm flex h-7 shrink-0 items-center gap-1 border px-2 transition-colors"
              >
                <DownloadIcon className="size-3.5" />
                <span className="chatcn-text-12">Download</span>
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ArtifactsPart({ part }: { part: ChatcnPart }) {
  const { onOpenFile, onDownloadFile } = React.useContext(PartContext)
  const data = (part as { data?: { files?: WorkspaceFile[] } }).data
  const files = data?.files ?? []
  if (!files.length) return null
  return <RunArtifacts files={files} onOpen={onOpenFile} onDownload={onDownloadFile} />
}

export { FilesView, ChangesView }
