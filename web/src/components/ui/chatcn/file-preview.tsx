"use client"

import { Tabs } from "@base-ui/react/tabs"
import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { CodeBlock } from "@/components/ui/chatcn/code-block"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/chatcn/dialog"
import { Markdown } from "@/components/ui/chatcn/markdown"
import { Mermaid } from "@/components/ui/chatcn/mermaid"
import { Spinner } from "@/components/ui/chatcn/spinner"
import { languageFromPath, languageLabel } from "@/lib/chatcn-highlighter"
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
} from "@/lib/chatcn-icons"
import { formatBytes } from "@/lib/api"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Kinds
 * -----------------------------------------------------------------------------------------------*/

type FileKind = "image" | "pdf" | "markdown" | "mermaid" | "code" | "text" | "other"

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp", "heic", "ico"])
const MARKDOWN_EXT = new Set(["md", "markdown", "mdx"])
const MERMAID_EXT = new Set(["mmd", "mermaid"])
const TEXT_EXT = new Set([
  "txt",
  "log",
  "csv",
  "tsv",
  "json",
  "jsonc",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "env",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
  "py",
  "pyw",
  "ipynb",
  "rs",
  "go",
  "rb",
  "php",
  "java",
  "kt",
  "kts",
  "swift",
  "c",
  "h",
  "cpp",
  "cc",
  "cxx",
  "hpp",
  "hh",
  "cs",
  "sh",
  "bash",
  "zsh",
  "fish",
  "sql",
  "graphql",
  "gql",
  "prisma",
  "vue",
  "svelte",
  "diff",
  "patch",
  "tex",
])

function extensionOf(path: string) {
  const name = path.split(/[\\/]/).pop() ?? path
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

function nameOf(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

/** What the viewer can do with a path, from its extension. */
function kindOf(path: string): FileKind {
  const ext = extensionOf(path)
  if (IMAGE_EXT.has(ext)) return "image"
  if (ext === "pdf") return "pdf"
  if (MARKDOWN_EXT.has(ext)) return "markdown"
  if (MERMAID_EXT.has(ext)) return "mermaid"
  if (ext === "docx" || ext === "doc" || ext === "odt" || ext === "pptx" || ext === "xlsx") {
    return "other"
  }
  if (TEXT_EXT.has(ext)) return languageFromPath(path) === "text" ? "text" : "code"
  return "other"
}

function kindIcon(kind: FileKind) {
  if (kind === "image") return <FileImageIcon />
  if (kind === "code" || kind === "markdown" || kind === "mermaid") return <FileCodeIcon />
  if (kind === "text") return <FileTextIcon />
  return <FileIcon />
}

/* -------------------------------------------------------------------------------------------------
 * Text loading
 * -----------------------------------------------------------------------------------------------*/

type TextState =
  | { status: "loading"; text: "" }
  | { status: "ready"; text: string }
  | { status: "error"; text: ""; error: string }

/** Fetches a text-like workspace file once the viewer opens. Binary kinds never call this. */
function useFileText(url: string, enabled: boolean): TextState {
  const [state, setState] = React.useState<TextState>({ status: "loading", text: "" })
  React.useEffect(() => {
    if (!enabled) return
    let alive = true
    setState({ status: "loading", text: "" })
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load this file (HTTP ${response.status}).`)
        return response.text()
      })
      .then((text) => {
        if (alive) setState({ status: "ready", text })
      })
      .catch((cause: unknown) => {
        if (alive) {
          setState({
            status: "error",
            text: "",
            error: cause instanceof Error ? cause.message : "Could not load this file.",
          })
        }
      })
    return () => {
      alive = false
    }
  }, [url, enabled])
  return state
}

function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="text-chatcn-fg-subtle flex flex-1 items-center justify-center gap-2 py-12">
      <Spinner className="size-4" />
      <span className="chatcn-text-13">{label}</span>
    </div>
  )
}

function TextError({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <p className="chatcn-text-13 text-chatcn-fg-muted max-w-72 text-center text-pretty">
        {message}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Body
 * -----------------------------------------------------------------------------------------------*/

interface FilePreviewBodyProps {
  path: string
  url: string
  /** Text fetched by the caller, when it already has it. */
  text?: TextState
}

/** The scrollable inner view for one file: image, PDF, rendered Markdown, source or code. */
function FilePreviewBody({ path, url, text }: FilePreviewBodyProps) {
  const kind = kindOf(path)

  if (kind === "image") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={url}
          alt={nameOf(path)}
          className="rounded-chatcn-md max-h-full max-w-full object-contain"
        />
      </div>
    )
  }

  if (kind === "pdf") {
    return (
      <iframe
        src={url}
        title={nameOf(path)}
        className="bg-chatcn-bg min-h-0 w-full flex-1 border-0"
      />
    )
  }

  if (kind === "markdown") return <MarkdownBody path={path} text={text} />
  if (kind === "mermaid") return <MermaidBody path={path} text={text} />
  if (kind === "code" || kind === "text") return <CodeBody path={path} text={text} />

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="text-chatcn-fg-subtle [&_svg]:size-6">
        <FileIcon />
      </span>
      <p className="chatcn-text-13 text-chatcn-fg-muted max-w-72 text-pretty">
        This file type cannot be previewed here. Open or download it to view its contents.
      </p>
    </div>
  )
}

function MarkdownBody({ path, text }: { path: string; text?: TextState }) {
  const [view, setView] = React.useState("preview")
  const state = text ?? { status: "loading" as const, text: "" }
  if (state.status === "loading") return <Loading />
  if (state.status === "error") return <TextError message={state.error} />
  return (
    <Tabs.Root
      value={view}
      onValueChange={(v) => setView(String(v))}
      className="flex min-h-0 flex-1 flex-col"
    >
      <Tabs.List
        aria-label="Markdown view"
        className="border-chatcn-border flex shrink-0 items-center gap-0.5 border-b px-3 py-1.5"
      >
        <PreviewTab value="preview">Preview</PreviewTab>
        <PreviewTab value="source">Markdown</PreviewTab>
      </Tabs.List>
      <Tabs.Panel
        value="preview"
        className="chatcn-scroll min-h-0 flex-1 overflow-auto px-5 py-4 outline-none"
      >
        <Markdown className="mx-auto max-w-2xl">{state.text}</Markdown>
      </Tabs.Panel>
      <Tabs.Panel value="source" className="chatcn-scroll min-h-0 flex-1 overflow-auto outline-none">
        <CodeBlock
          code={state.text}
          language="markdown"
          showLineNumbers
          collapseAfter={false}
          className="rounded-none"
        />
      </Tabs.Panel>
    </Tabs.Root>
  )
}

function MermaidBody({ path, text }: { path: string; text?: TextState }) {
  const [view, setView] = React.useState("diagram")
  const state = text ?? { status: "loading" as const, text: "" }
  if (state.status === "loading") return <Loading />
  if (state.status === "error") return <TextError message={state.error} />
  return (
    <Tabs.Root
      value={view}
      onValueChange={(v) => setView(String(v))}
      className="flex min-h-0 flex-1 flex-col"
    >
      <Tabs.List
        aria-label="Diagram view"
        className="border-chatcn-border flex shrink-0 items-center gap-0.5 border-b px-3 py-1.5"
      >
        <PreviewTab value="diagram">Diagram</PreviewTab>
        <PreviewTab value="source">Code</PreviewTab>
      </Tabs.List>
      <Tabs.Panel value="diagram" className="chatcn-scroll min-h-0 flex-1 overflow-auto p-4 outline-none">
        <Mermaid chart={state.text} />
      </Tabs.Panel>
      <Tabs.Panel value="source" className="chatcn-scroll min-h-0 flex-1 overflow-auto outline-none">
        <CodeBlock
          code={state.text}
          language="mermaid"
          showLineNumbers
          collapseAfter={false}
          className="rounded-none"
        />
      </Tabs.Panel>
    </Tabs.Root>
  )
}

function CodeBody({ path, text }: { path: string; text?: TextState }) {
  const state = text ?? { status: "loading" as const, text: "" }
  if (state.status === "loading") return <Loading />
  if (state.status === "error") return <TextError message={state.error} />
  return (
    <div className="chatcn-scroll min-h-0 flex-1 overflow-auto">
      <CodeBlock
        code={state.text}
        language={languageFromPath(path)}
        filename={nameOf(path)}
        showLineNumbers
        collapseAfter={false}
        className="rounded-none"
      />
    </div>
  )
}

function PreviewTab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Tabs.Tab
      value={value}
      className={cn(
        "chatcn-focus chatcn-text-12 rounded-chatcn-sm text-chatcn-fg-subtle h-7 shrink-0 px-2.5",
        "ease-chatcn-standard transition-colors duration-150",
        "hover:text-chatcn-fg data-[active]:bg-chatcn-fill-active data-[active]:text-chatcn-fg",
      )}
    >
      {children}
    </Tabs.Tab>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Dialog
 * -----------------------------------------------------------------------------------------------*/

interface FilePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  path: string
  /** URL the file is served from. Used for fetching, images and PDFs. */
  url: string
  size?: number
  onDownload?: (path: string) => void
  /** Open outside the app, for readers the WebView cannot render. */
  onOpenExternal?: (path: string) => void
}

/**
 * One viewer for every workspace file. Images and PDFs render inline; Markdown and Mermaid switch
 * between a rendered view and their source; code is highlighted with line numbers. The original
 * source is always shown untouched in the source view, so switching views never rewrites it.
 */
function FilePreviewDialog({
  open,
  onOpenChange,
  path,
  url,
  size,
  onDownload,
  onOpenExternal,
}: FilePreviewDialogProps) {
  const kind = kindOf(path)
  const needsText = kind === "markdown" || kind === "mermaid" || kind === "code" || kind === "text"
  const text = useFileText(url, open && needsText)
  const label = kind === "code" ? languageLabel(languageFromPath(path)) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        className="h-[min(86dvh,56rem)] w-[min(64rem,calc(100vw-1.25rem))]"
        data-slot="file-preview"
      >
        <header className="border-chatcn-border flex h-12 shrink-0 items-center gap-2 border-b ps-4 pe-12">
          <span className="text-chatcn-fg-subtle shrink-0 [&_svg]:size-4">{kindIcon(kind)}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <DialogTitle className="chatcn-text-14 text-chatcn-fg truncate font-medium">
              {nameOf(path)}
            </DialogTitle>
            <span className="chatcn-text-12 text-chatcn-fg-subtle truncate tabular-nums">
              {[label ?? extensionOf(path).toUpperCase(), size ? formatBytes(size) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {onOpenExternal ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open outside the app"
              title="Open outside the app"
              onClick={() => onOpenExternal(path)}
            >
              <ExternalLinkIcon />
            </Button>
          ) : null}
          {onDownload ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Download"
              title="Download"
              onClick={() => onDownload(path)}
            >
              <DownloadIcon />
            </Button>
          ) : null}
        </header>
        <FilePreviewBody path={path} url={url} text={needsText ? text : undefined} />
      </DialogContent>
    </Dialog>
  )
}

export type { FileKind, FilePreviewBodyProps, FilePreviewDialogProps }
export { FilePreviewBody, FilePreviewDialog, kindOf }
