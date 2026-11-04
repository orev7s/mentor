import * as React from "react"
import { buttonVariants } from "@/components/ui/chatcn/button"
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuTrigger,
} from "@/components/ui/chatcn/menu"
import { Spinner } from "@/components/ui/chatcn/spinner"
import {
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  ImagePlusIcon,
  PaperclipIcon,
  XIcon,
} from "@/lib/chatcn-icons"
import { type Attachment, formatBytes } from "@/lib/api"
import { cn } from "@/lib/utils"

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|svg|avif|bmp|heic|ico)$/i
/** Everything the paperclip accepts, matching what the server can store and the agent can read. */
export const ATTACH_ACCEPT =
  ".pdf,.doc,.docx,.odt,.txt,.md,.markdown,.rtf,.html,.htm,.csv,.tsv,.json,.yaml,.yml,.xml,.ipynb,.tex,.py,.js,.jsx,.ts,.tsx,.java,.kt,.swift,.c,.h,.cpp,.cc,.hpp,.cs,.go,.rs,.rb,.php,.sh,.bash,.sql,.css,.scss,.vue,.svelte,.mmd,.mermaid,.png,.jpg,.jpeg,.webp,.gif,.svg,.avif,.heic"
const CODE_FILE = new Set([
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
  "py",
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
  "hpp",
  "cs",
  "sh",
  "bash",
  "zsh",
  "sql",
  "yaml",
  "yml",
  "json",
  "html",
  "htm",
  "css",
  "scss",
  "md",
  "markdown",
  "mmd",
  "vue",
  "svelte",
])

export function isImageAttachment(name: string) {
  return IMAGE_FILE.test(name)
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".")
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : ""
}

function AttachmentFileIcon({ name }: { name: string }) {
  const ext = extensionOf(name)
  if (ext === "pdf" || ext === "doc" || ext === "docx" || ext === "txt") return <FileTextIcon />
  if (CODE_FILE.has(ext)) return <FileCodeIcon />
  return <FileIcon />
}

/** The paperclip, now a small menu so an image never has to go through the document picker. */
export function AttachmentMenuButton({
  className,
  onFiles,
  disabled,
  accept,
}: {
  className?: string
  onFiles?: (files: File[]) => void
  disabled?: boolean
  accept?: string
}) {
  const imageInput = React.useRef<HTMLInputElement>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  if (!onFiles) return null
  const send = (files: FileList | null) => {
    if (files?.length) onFiles(Array.from(files))
  }
  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label="Add attachment"
          title="Add attachment"
          disabled={disabled}
          data-slot="prompt-input-attach"
          data-testid="attach-menu"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-8 gap-1 rounded-full px-2 text-xs text-[#9CA3AF] hover:bg-transparent hover:text-[#D1D5DB] [&_svg]:size-4",
            className,
          )}
        >
          <PaperclipIcon />
          <span>Attach</span>
        </MenuTrigger>
        <MenuContent side="top" align="start" sideOffset={8} className="min-w-52">
          <MenuGroup>
            <MenuLabel>Add attachment</MenuLabel>
            <MenuItem onClick={() => imageInput.current?.click()} data-testid="attach-image">
              <ImagePlusIcon />
              Add image
            </MenuItem>
            <MenuItem onClick={() => fileInput.current?.click()} data-testid="attach-file">
              <FileTextIcon />
              Add file
            </MenuItem>
          </MenuGroup>
        </MenuContent>
      </Menu>
      <input
        ref={imageInput}
        type="file"
        multiple
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onChange={(event) => {
          send(event.target.files)
          event.target.value = ""
        }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onChange={(event) => {
          send(event.target.files)
          event.target.value = ""
        }}
      />
    </>
  )
}

function RemoveAttachmentButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Remove ${name}`}
      title="Remove"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={cn(
        "chatcn-focus bg-chatcn-scrim text-chatcn-on-media absolute end-1.5 top-1.5 z-10 grid size-6 place-items-center rounded-full",
        "ease-chatcn-standard backdrop-blur-sm transition-[background-color,scale] duration-150 active:scale-90",
        "after:absolute after:-inset-2 after:content-['']",
        "hover:bg-chatcn-gray-900",
      )}
    >
      <XIcon className="size-3.5" />
    </button>
  )
}

function ImageAttachmentCard({
  file,
  src,
  onRemove,
  onPreview,
}: {
  file: Attachment
  src?: string
  onRemove: (path: string) => void
  onPreview: (file: Attachment) => void
}) {
  const [status, setStatus] = React.useState<"loading" | "loaded" | "error">("loading")
  React.useEffect(() => setStatus("loading"), [src])
  const showImage = Boolean(src) && status !== "error"
  return (
    <div data-slot="attachment" data-kind="image" className="relative w-24 min-w-0">
      <button
        type="button"
        onClick={() => onPreview(file)}
        title={file.name}
        className="chatcn-focus border-chatcn-border bg-chatcn-fill hover:bg-chatcn-fill-hover block w-full overflow-hidden rounded-chatcn-lg border text-start transition-colors"
      >
        <span className="bg-chatcn-fill-hover relative block aspect-square w-full overflow-hidden">
          {showImage ? (
            <>
              {status === "loading" ? (
                <span
                  aria-hidden="true"
                  className="bg-chatcn-fill absolute inset-0 animate-pulse"
                />
              ) : null}
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                onLoad={() => setStatus("loaded")}
                onError={() => setStatus("error")}
                className={cn(
                  "relative size-full object-cover transition-opacity duration-200",
                  status === "loaded" ? "opacity-100" : "opacity-0",
                )}
              />
            </>
          ) : (
            <span className="text-chatcn-fg-subtle grid size-full place-items-center">
              <FileImageIcon className="size-6" />
            </span>
          )}
        </span>
        <span className="chatcn-text-12 text-chatcn-fg-muted block truncate px-2 py-1.5">
          {file.name}
        </span>
      </button>
      <RemoveAttachmentButton name={file.name} onClick={() => onRemove(file.path)} />
    </div>
  )
}

function FileAttachmentCard({
  file,
  onRemove,
  onPreview,
}: {
  file: Attachment
  onRemove: (path: string) => void
  onPreview: (file: Attachment) => void
}) {
  return (
    <div data-slot="attachment" data-kind="file" className="relative min-w-0">
      <button
        type="button"
        onClick={() => onPreview(file)}
        title={file.name}
        className="chatcn-focus border-chatcn-border bg-chatcn-fill hover:bg-chatcn-fill-hover flex w-full min-w-0 items-center gap-2.5 rounded-chatcn-lg border p-2 pe-9 text-start transition-colors"
      >
        <span className="bg-chatcn-bg-subtle text-chatcn-fg-subtle grid size-9 shrink-0 place-items-center rounded-chatcn-md [&_svg]:size-5">
          <AttachmentFileIcon name={file.name} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="chatcn-text-13 text-chatcn-fg block truncate font-medium">
            {file.name}
          </span>
          <span className="chatcn-text-12 text-chatcn-fg-subtle block truncate tabular-nums">
            {[extensionOf(file.name).toUpperCase() || "FILE", formatBytes(file.size)].join(" · ")}
          </span>
        </span>
      </button>
      <RemoveAttachmentButton name={file.name} onClick={() => onRemove(file.path)} />
    </div>
  )
}

/**
 * Pending uploads as compact cards: images in a thumbnail grid, documents as icon cards. The grid
 * fills the composer width and folds to one column when there is no room for two.
 */
function UploadingCard({ file }: { file: { name: string } }) {
  return (
    <div
      data-slot="attachment"
      data-kind="uploading"
      aria-busy="true"
      className="border-chatcn-border bg-chatcn-fill flex min-w-0 items-center gap-2.5 rounded-chatcn-lg border border-dashed p-2 pe-3"
    >
      <span className="bg-chatcn-bg-subtle text-chatcn-fg-subtle grid size-9 shrink-0 place-items-center rounded-chatcn-md">
        <Spinner className="size-4" label="Uploading" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="chatcn-text-13 text-chatcn-fg block truncate font-medium">
          {file.name}
        </span>
        <span className="chatcn-text-12 text-chatcn-fg-subtle block">Uploading...</span>
      </span>
    </div>
  )
}

export function AttachmentCards({
  attachments,
  uploads,
  fileUrl,
  onRemove,
  onPreviewImage,
  onPreviewFile,
}: {
  attachments: Attachment[]
  uploads: { id: string; name: string }[]
  fileUrl?: (path: string) => string
  onRemove: (path: string) => void
  onPreviewImage: (file: Attachment) => void
  onPreviewFile: (file: Attachment) => void
}) {
  const images = attachments.filter((file) => isImageAttachment(file.name))
  const docs = attachments.filter((file) => !isImageAttachment(file.name))
  const hasDocs = docs.length > 0 || uploads.length > 0
  if (!images.length && !hasDocs) return null
  return (
    <div className="flex flex-col gap-2">
      {images.length ? (
        <div className="flex flex-wrap gap-2">
          {images.map((file) => (
            <ImageAttachmentCard
              key={file.path}
              file={file}
              src={fileUrl?.(file.thumbPath ?? file.path)}
              onRemove={onRemove}
              onPreview={onPreviewImage}
            />
          ))}
        </div>
      ) : null}
      {hasDocs ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
          {uploads.map((file) => (
            <UploadingCard key={file.id} file={file} />
          ))}
          {docs.map((file) => (
            <FileAttachmentCard
              key={file.path}
              file={file}
              onRemove={onRemove}
              onPreview={onPreviewFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
