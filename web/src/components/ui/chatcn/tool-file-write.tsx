import { ToolCall } from "@/components/ui/chatcn/tool-call"
import {
  isToolRunning,
  pickString,
  type ToolBaseProps,
  ToolDetail,
  ToolPath,
  type ToolRendererMap,
  type ToolRendererProps,
  toolBasePropsFromPart,
} from "@/components/ui/chatcn/tool-fallback"
import { ToolCodePreview } from "@/components/ui/chatcn/tool-file-read"
import { languageFromPath, languageLabel } from "@/lib/chatcn-highlighter"
import { FileCodeIcon, FilePlus2Icon } from "@/lib/chatcn-icons"

interface ToolFileWriteProps extends ToolBaseProps {
  path?: string
  content?: string
  /** True when the write replaced an existing file. Changes "Created" to "Wrote". */
  overwrite?: boolean
  /** Lines shown in the preview. Defaults to 12. */
  previewLines?: number
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function splitPath(path: string) {
  const i = path.lastIndexOf("/")
  return i < 0 ? { dir: "", file: path } : { dir: path.slice(0, i + 1), file: path.slice(i + 1) }
}

/** A new file: the path in the header, then a file card with its name, size and first lines. */
function ToolFileWrite({
  name = "write_file",
  path,
  content,
  overwrite = false,
  previewLines = 12,
  ...props
}: ToolFileWriteProps) {
  const running = isToolRunning(props.state, props.decision)
  const showBody =
    content !== undefined &&
    path !== undefined &&
    props.state !== "output-error" &&
    props.state !== "output-denied"
  const lines = content ? content.replace(/\n$/, "").split("\n").length : 0
  const bytes = content ? new TextEncoder().encode(content).length : 0
  const { dir, file } = splitPath(path ?? "")

  const body = showBody ? (
    <div
      data-slot="file-write-card"
      className="rounded-chatcn-md bg-chatcn-inset min-w-0 overflow-hidden"
    >
      <div className="flex min-w-0 items-center gap-2 px-3 pt-2.5 pb-1">
        <FileCodeIcon aria-hidden="true" className="text-chatcn-fg-subtle size-4 shrink-0" />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="chatcn-text-13 text-chatcn-fg shrink-0 font-medium">{file}</span>
          {dir ? (
            <span className="chatcn-text-12 text-chatcn-fg-subtle truncate font-mono">{dir}</span>
          ) : null}
        </span>
        <span className="chatcn-text-12 text-chatcn-fg-subtle shrink-0 tabular-nums">
          {lines} {lines === 1 ? "line" : "lines"}, {formatBytes(bytes)}
        </span>
      </div>
      {content ? (
        <ToolCodePreview
          code={content}
          language={languageFromPath(path)}
          label={languageLabel(languageFromPath(path))}
          maxLines={previewLines}
          className="rounded-none"
        />
      ) : (
        <p className="chatcn-text-12 text-chatcn-fg-subtle px-3 pb-2.5">Empty file</p>
      )}
    </div>
  ) : undefined

  const doneTitle = overwrite ? "Wrote" : "Created"
  return (
    <ToolCall
      name={name}
      icon={<FilePlus2Icon />}
      title={running ? "Writing" : props.state === "output-available" ? doneTitle : "Write"}
      detail={<ToolDetail>{path ? <ToolPath path={path} /> : undefined}</ToolDetail>}
      {...props}
    >
      {body}
    </ToolCall>
  )
}

function ToolFileWritePart(props: ToolRendererProps) {
  const { part } = props
  return (
    <ToolFileWrite
      {...toolBasePropsFromPart(props)}
      path={pickString(part.input, "path", "file", "filePath", "file_path")}
      content={pickString(part.input, "content", "text", "contents")}
    />
  )
}

/** Tool names this renderer handles. Spread into your renderer map. */
const toolFileWriteRenderers: ToolRendererMap = {
  write_file: ToolFileWritePart,
  write: ToolFileWritePart,
  create_file: ToolFileWritePart,
}

export type { ToolFileWriteProps }
export { ToolFileWrite, ToolFileWritePart, toolFileWriteRenderers }
