import { Collapsible } from "@base-ui/react/collapsible"
import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { CopyButton } from "@/components/ui/chatcn/copy-button"
import { StreamingCaret } from "@/components/ui/chatcn/streaming-caret"
import { ChevronDownIcon, RotateCcwIcon } from "@/lib/chatcn-icons"
import { parsePartialJson } from "@/lib/chatcn-partial-json"
import {
  type ChatcnToolPart,
  getToolDisplayState,
  getToolName,
} from "@/lib/chatcn-types"
import { cn } from "@/lib/utils"
import { ToolCallApproval } from "./tool/tool-call-approval"
import { JsonValue, stringify, ToolCallCode, ToolCallSection } from "./tool/tool-call-json"
import {
  detailFrom,
  humanize,
  iconFor,
  isRunning,
  type ToolCallProps,
  useAutoTiming,
  useElapsed,
} from "./tool/tool-call-shared"
import { statusLabel, ToolCallStatus } from "./tool/tool-call-status"

/* -------------------------------------------------------------------------------------------------
 * ToolCall
 * -----------------------------------------------------------------------------------------------*/

function ToolCall({
  name,
  title,
  detail,
  icon,
  state,
  input,
  inputText,
  output,
  outputCopyValue,
  meta: metaSlot,
  approvalTarget,
  statusLabel: statusLabelProp,
  errorText,
  approval,
  decision,
  onApprove,
  onDeny,
  onRetry,
  durationMs,
  startedAt,
  variant = "card",
  open: openProp,
  defaultOpen,
  onOpenChange,
  className,
  children,
  ...props
}: ToolCallProps) {
  const label = typeof title === "string" ? title : humanize(name)
  // Lowercase only the first letter, so "Edit file" reads "edit file" but "GitHub search" keeps its case.
  const target =
    approvalTarget ??
    (/^[A-Z][a-z]*(\s|$)/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label)
  const running = isRunning(state, decision)
  const auto = useAutoTiming(running, state === "output-available")
  const elapsed = useElapsed(startedAt ?? auto.startedAt, running)

  // Uncontrolled open state opens itself when the tool needs the user: approval or failure.
  const [openState, setOpenState] = React.useState(
    defaultOpen ?? (state === "approval-requested" || state === "output-error"),
  )
  const open = openProp ?? openState
  const prevState = React.useRef(state)
  React.useEffect(() => {
    if (prevState.current === state) return
    prevState.current = state
    if (openProp === undefined && (state === "approval-requested" || state === "output-error")) {
      setOpenState(true)
    }
  }, [state, openProp])

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next)
    onOpenChange?.(next)
  }

  const streamingInput = state === "input-streaming"
  const shownInput = React.useMemo(() => {
    if (streamingInput && inputText !== undefined) return parsePartialJson(inputText).value
    return input
  }, [streamingInput, inputText, input])

  const hasInput = shownInput !== undefined && shownInput !== null
  const hasOutput = state === "output-available" && output !== undefined
  const statusText = statusLabel({
    state,
    decision,
    durationMs: durationMs ?? auto.durationMs,
    elapsed,
  })
  const shownDetail = detail ?? detailFrom(shownInput)
  const isCard = variant === "card"

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      render={<div />}
      data-slot="tool-call"
      data-tool-state={state}
      data-variant={variant}
      className={cn(
        "group/tool-call chatcn-text-14 text-chatcn-fg",
        isCard && "rounded-chatcn-lg bg-chatcn-card shadow-chatcn-sm overflow-hidden",
        className,
      )}
      {...props}
    >
      <Collapsible.Trigger
        className={cn(
          "flex w-full min-w-0 items-center gap-2.5 text-left outline-none select-none",
          "ease-chatcn-standard transition-colors duration-150",
          "focus-visible:outline-chatcn-accent focus-visible:outline-2 focus-visible:-outline-offset-2",
          isCard
            ? "hover:bg-chatcn-alpha-100 h-10 px-3.5 pointer-coarse:h-11"
            : "rounded-chatcn-md hover:bg-chatcn-fill-hover h-8 px-2 pointer-coarse:h-11",
        )}
      >
        <ToolCallStatus state={state} decision={decision} icon={icon ?? iconFor(name)} />
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 font-medium">{title ?? label}</span>
          {shownDetail ? (
            <span className="chatcn-text-12 text-chatcn-fg-subtle truncate font-mono">
              {shownDetail}
            </span>
          ) : null}
        </span>
        {metaSlot ? (
          <span className="chatcn-text-12 text-chatcn-fg-subtle shrink-0 tabular-nums">
            {metaSlot}
          </span>
        ) : null}
        <span
          aria-live="polite"
          className={cn(
            "chatcn-text-12 shrink-0 tabular-nums",
            state === "output-error" && statusLabelProp === undefined
              ? "text-chatcn-red"
              : "text-chatcn-fg-subtle",
          )}
        >
          {statusLabelProp ?? statusText}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "text-chatcn-fg-subtle ease-chatcn-out size-4 shrink-0 transition-transform duration-200",
            "group-data-[open]/tool-call:rotate-180 motion-reduce:transition-none",
          )}
        />
      </Collapsible.Trigger>

      <Collapsible.Panel
        className={cn(
          "h-(--collapsible-panel-height) overflow-hidden",
          // Height is the one layout property we animate: Base UI measures it, and it stays
          // short. During streaming the panel is `auto`, so content grows without a transition.
          "ease-chatcn-out transition-[height,opacity] duration-200 motion-reduce:transition-none",
          "data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0",
        )}
      >
        <div
          className={cn(
            "flex flex-col gap-3",
            isCard
              ? "px-3.5 pt-1 pb-3.5"
              : cn(
                  "border-chatcn-border ms-[15.5px] mt-1 border-s ps-[17.5px] pt-1",
                  // An approval below continues the same guide line without a break.
                  state === "approval-requested" && approval ? "mb-0" : "mb-2",
                ),
          )}
        >
          {children ?? (
            <>
              {hasInput ? (
                <ToolCallSection
                  label="Input"
                  action={
                    streamingInput ? null : (
                      <CopyButton
                        size="icon-xs"
                        value={() => stringify(shownInput)}
                        label="Copy input"
                      />
                    )
                  }
                >
                  <ToolCallCode streaming={streamingInput}>
                    {typeof shownInput === "string" ? (
                      shownInput
                    ) : (
                      <JsonValue value={shownInput} depth={0} />
                    )}
                  </ToolCallCode>
                </ToolCallSection>
              ) : streamingInput ? (
                <ToolCallSection label="Input">
                  <ToolCallCode streaming>{""}</ToolCallCode>
                </ToolCallSection>
              ) : null}

              {hasOutput ? (
                <ToolCallSection
                  label="Output"
                  action={
                    outputCopyValue !== undefined || !React.isValidElement(output) ? (
                      <CopyButton
                        size="icon-xs"
                        value={() => outputCopyValue ?? stringify(output)}
                        label="Copy output"
                      />
                    ) : null
                  }
                >
                  {React.isValidElement(output) ? (
                    output
                  ) : (
                    <ToolCallCode>
                      {typeof output === "string" ? output : <JsonValue value={output} depth={0} />}
                    </ToolCallCode>
                  )}
                </ToolCallSection>
              ) : null}

              {state === "output-error" ? (
                <ToolCallSection
                  label="Error"
                  action={
                    onRetry ? (
                      <Button size="xs" onClick={onRetry}>
                        <RotateCcwIcon />
                        Retry
                      </Button>
                    ) : null
                  }
                >
                  <ToolCallCode className="text-chatcn-fg">
                    {errorText ?? "The tool failed without a message."}
                  </ToolCallCode>
                </ToolCallSection>
              ) : null}

              {decision ? (
                <p className="chatcn-text-12 text-chatcn-fg-subtle">
                  {decision.approved
                    ? decision.scope === "always"
                      ? `Always allowed for ${target}`
                      : "Allowed once"
                    : decision.reason
                      ? `Denied: ${decision.reason}`
                      : "Denied"}
                </p>
              ) : null}
            </>
          )}
        </div>
      </Collapsible.Panel>

      {state === "approval-requested" && approval ? (
        <ToolCallApproval
          inline={!isCard}
          approval={approval}
          toolLabel={target}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      ) : null}
    </Collapsible.Root>
  )
}

/* -------------------------------------------------------------------------------------------------
 * From a message part
 * -----------------------------------------------------------------------------------------------*/

/**
 * Maps a tool part (chatcn contract or AI SDK `UIMessage` part) to `ToolCall` props.
 * `<ToolCall {...toolCallPropsFromPart(part)} onApprove={...} />`
 */
function toolCallPropsFromPart(
  part: ChatcnToolPart,
  options?: { stopped?: boolean },
): Pick<
  ToolCallProps,
  "name" | "state" | "input" | "inputText" | "output" | "errorText" | "approval" | "decision"
> &
  Partial<Pick<ToolCallProps, "title">> {
  const state = getToolDisplayState(part, options)
  const approval = part.approval
  return {
    name: getToolName(part),
    ...(part.title ? { title: part.title } : {}),
    state,
    input: part.input,
    inputText: typeof part.rawInput === "string" ? part.rawInput : undefined,
    output: part.output,
    errorText: part.errorText,
    approval:
      approval && state === "approval-requested"
        ? { id: approval.id, reason: approval.requestReason }
        : undefined,
    decision:
      approval && approval.approved !== undefined
        ? { approved: approval.approved, reason: approval.reason }
        : undefined,
  }
}

export type { ApprovalScope, ToolCallApprovalRequest, ToolCallProps } from "./tool/tool-call-shared"
export {
  StreamingCaret,
  ToolCall,
  ToolCallApproval,
  ToolCallCode,
  ToolCallSection,
  ToolCallStatus,
  toolCallPropsFromPart,
}
