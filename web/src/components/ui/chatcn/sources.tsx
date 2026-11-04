import { Collapsible } from "@base-ui/react/collapsible"
import * as React from "react"
import { ChevronDownIcon } from "@/lib/chatcn-icons"
import type { ChatcnSourceUrlPart } from "@/lib/chatcn-types"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Types and helpers
 * -----------------------------------------------------------------------------------------------*/

interface Source {
  /** Stable id, for example the AI SDK `sourceId`. Defaults to the URL. */
  id?: string
  url: string
  title?: string
  snippet?: string
  /** Defaults to the URL host without `www.`. */
  domain?: string
  /** Optional favicon URL. Falls back to a monochrome letter tile when missing or broken. */
  favicon?: string
}

/** Host of a URL without `www.`, or the input when it is not a URL. */
function getSourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** Maps `source-url` parts to `Source` objects, dropping duplicate URLs. */
function sourcesFromParts(parts: { type: string }[]): Source[] {
  const seen = new Set<string>()
  const out: Source[] = []
  for (const part of parts) {
    if (part.type !== "source-url") continue
    const p = part as ChatcnSourceUrlPart
    if (seen.has(p.url)) continue
    seen.add(p.url)
    out.push({ id: p.sourceId, url: p.url, title: p.title })
  }
  return out
}

/* -------------------------------------------------------------------------------------------------
 * SourceTile
 * -----------------------------------------------------------------------------------------------*/

interface SourceTileProps extends React.ComponentProps<"span"> {
  source: Pick<Source, "url" | "domain" | "favicon">
}

/**
 * A favicon slot. Without a favicon it shows the domain's first letter on a gray tile: no brand
 * colors, so a row of sources stays as calm as the text around it.
 */
function SourceTile({ source, className, ...props }: SourceTileProps) {
  const [broken, setBroken] = React.useState(false)
  const domain = source.domain ?? getSourceDomain(source.url)
  const letter =
    domain
      .replace(/^[^a-z0-9]+/i, "")
      .charAt(0)
      .toUpperCase() || "?"
  return (
    <span
      data-slot="source-tile"
      aria-hidden="true"
      className={cn(
        "bg-chatcn-fill-active text-chatcn-fg-muted rounded-chatcn-xs relative grid size-[1.125rem] shrink-0 place-items-center overflow-hidden",
        "chatcn-text-12 leading-none font-medium select-none",
        className,
      )}
      {...props}
    >
      {source.favicon && !broken ? (
        <img
          src={source.favicon}
          alt=""
          width={18}
          height={18}
          loading="lazy"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      ) : (
        letter
      )}
    </span>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Sources
 * -----------------------------------------------------------------------------------------------*/

interface SourcesProps extends Omit<React.ComponentProps<"div">, "children"> {
  sources: Source[]
  /** Trigger label. Defaults to "12 sources". */
  label?: React.ReactNode
  /** How many tiles to stack in the trigger. Defaults to 4. */
  maxTiles?: number
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * The sources behind an answer. Collapsed: a stack of letter tiles and "12 sources". Expanded: a
 * numbered list whose numbers match the inline citations.
 */
function Sources({
  sources,
  label,
  maxTiles = 4,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
  ...props
}: SourcesProps) {
  if (sources.length === 0) return null
  const count = sources.length
  const stack = sources.slice(0, maxTiles)

  return (
    <Collapsible.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      render={<div />}
      data-slot="sources"
      className={cn("group/sources chatcn-text-14 min-w-0", className)}
      {...props}
    >
      <Collapsible.Trigger
        className={cn(
          "chatcn-focus rounded-chatcn-md inline-flex h-8 items-center gap-2 ps-1.5 pe-2 select-none",
          "text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg ease-chatcn-standard transition-colors duration-150",
          "data-[panel-open]:text-chatcn-fg pointer-coarse:h-11",
        )}
      >
        <span className="flex items-center">
          {stack.map((source, i) => (
            <SourceTile
              key={source.id ?? source.url}
              source={source}
              // Overlap by 4 px; the ring cuts each tile out of the one beneath it.
              className={cn("ring-chatcn-bg size-5 ring-2", i > 0 && "-ms-1")}
            />
          ))}
        </span>
        <span className="chatcn-text-13 font-medium tabular-nums">
          {label ?? `${count} ${count === 1 ? "source" : "sources"}`}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "text-chatcn-fg-subtle ease-chatcn-out size-3.5 shrink-0 transition-[rotate] duration-200",
            "group-data-[open]/sources:rotate-180 motion-reduce:transition-none",
          )}
        />
      </Collapsible.Trigger>
      <Collapsible.Panel
        className={cn(
          "h-(--collapsible-panel-height) overflow-hidden",
          "ease-chatcn-out transition-[height,opacity] duration-200 motion-reduce:transition-none",
          "data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
          "data-[starting-style]:h-0 data-[starting-style]:opacity-0",
        )}
      >
        <ol data-slot="sources-list" className="flex flex-col pt-1">
          {sources.map((source, i) => (
            <SourceRow key={source.id ?? source.url} source={source} index={i + 1} />
          ))}
        </ol>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

function SourceRow({ source, index }: { source: Source; index: number }) {
  const domain = source.domain ?? getSourceDomain(source.url)
  return (
    <li id={source.id ? `source-${source.id}` : undefined} className="min-w-0">
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "chatcn-focus rounded-chatcn-md group/source grid grid-cols-[1.25rem_1fr] gap-x-2 px-1.5 py-2",
          "hover:bg-chatcn-fill-hover ease-chatcn-standard transition-colors duration-150",
        )}
      >
        <span className="chatcn-text-12 text-chatcn-fg-subtle pt-px text-end font-medium tabular-nums">
          {index}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <SourceTile source={source} className="size-4" />
            <span className="chatcn-text-12 text-chatcn-fg-subtle truncate">{domain}</span>
          </span>
          <span className="chatcn-text-14 text-chatcn-fg truncate font-medium">
            {source.title ?? domain}
          </span>
          {source.snippet ? (
            <span className="chatcn-text-13 text-chatcn-fg-muted line-clamp-2 text-pretty">
              {source.snippet}
            </span>
          ) : null}
        </span>
      </a>
    </li>
  )
}

export type { Source, SourcesProps, SourceTileProps }
export { getSourceDomain, Sources, SourceTile, sourcesFromParts }
