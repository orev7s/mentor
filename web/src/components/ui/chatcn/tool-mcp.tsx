import type * as React from "react"
import { ToolCall } from "@/components/ui/chatcn/tool-call"
import {
  asRecord,
  type ToolBaseProps,
  ToolDetail,
  type ToolRendererMap,
  type ToolRendererProps,
  toolBasePropsFromPart,
} from "@/components/ui/chatcn/tool-fallback"
import { PlugIcon } from "@/lib/chatcn-icons"
import type { ChatcnToolPart } from "@/lib/chatcn-types"

interface ToolMcpProps extends ToolBaseProps {
  /** Connector or server name, for example "Linear". */
  server: string
  /** Tool name on that server, for example `create_issue`. */
  tool: string
  /** Connector mark. Provider logos are yours to supply; chatcn ships none. */
  icon?: React.ReactNode
  input?: unknown
  inputText?: string
  output?: unknown
}

/**
 * MCP results arrive as `{ content: [{ type: "text", text }] }`. Joins the text items so the
 * output reads as text, and passes anything else through for the JSON view.
 */
function mcpOutputText(output: unknown): unknown {
  const content = asRecord(output).content
  if (!Array.isArray(content)) return output
  const texts = content.flatMap((item) => {
    const r = asRecord(item)
    return r.type === "text" && typeof r.text === "string" ? [r.text] : []
  })
  return texts.length === content.length && texts.length > 0 ? texts.join("\n\n") : output
}

/**
 * A call to a tool on an MCP server or connector: the server name with its mark, the tool name in
 * mono, then input and output. Approval works the same as any tool call.
 */
function ToolMcp({
  server,
  tool,
  icon,
  input,
  inputText,
  output,
  name,
  approvalTarget,
  ...props
}: ToolMcpProps) {
  return (
    <ToolCall
      name={name ?? `mcp__${server}__${tool}`}
      // The server is a proper noun, so it keeps its case: "Always allow create_issue on Linear".
      approvalTarget={approvalTarget ?? `${tool} on ${server}`}
      icon={icon ?? <PlugIcon />}
      title={server}
      detail={<ToolDetail>{tool}</ToolDetail>}
      input={input}
      inputText={inputText}
      output={mcpOutputText(output)}
      {...props}
    />
  )
}

/**
 * Reads server and tool from common MCP tool names: `mcp__linear__create_issue` (Claude),
 * `linear.create_issue` or `linear/create_issue`. Falls back to the raw name.
 */
function parseMcpToolName(name: string): { server: string; tool: string } {
  const match = /^mcp__(.+?)__(.+)$/.exec(name) ?? /^(.+?)[./](.+)$/.exec(name)
  if (!match) return { server: "Connector", tool: name }
  const server = (match[1] as string).replace(/[_-]+/g, " ")
  return { server: server.charAt(0).toUpperCase() + server.slice(1), tool: match[2] as string }
}

function ToolMcpPart(props: ToolRendererProps) {
  const base = toolBasePropsFromPart(props)
  const part: ChatcnToolPart = props.part
  const { server, tool } = parseMcpToolName(base.name ?? "")
  return (
    <ToolMcp
      {...base}
      server={server}
      tool={tool}
      input={part.input}
      inputText={typeof part.rawInput === "string" ? part.rawInput : undefined}
      output={part.output}
    />
  )
}

/**
 * MCP tools have open-ended names, so this map holds one `mcp` entry: `renderToolPart` routes every
 * `mcp__server__tool` name to it.
 */
const toolMcpRenderers: ToolRendererMap = {
  mcp: ToolMcpPart,
}

/** True for names that look like MCP tools (`mcp__server__tool`). */
function isMcpToolName(name: string) {
  return name.startsWith("mcp__")
}

export type { ToolMcpProps }
export { isMcpToolName, mcpOutputText, parseMcpToolName, ToolMcp, ToolMcpPart, toolMcpRenderers }
