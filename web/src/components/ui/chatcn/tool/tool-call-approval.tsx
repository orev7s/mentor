import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import { CheckIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"
import { type ToolCallApprovalRequest, type ToolCallProps } from "./tool-call-shared"

/* -------------------------------------------------------------------------------------------------
 * Approval
 * -----------------------------------------------------------------------------------------------*/

export function ToolCallApproval({
  approval,
  toolLabel,
  onApprove,
  onDeny,
  inline,
}: {
  /** Inline rows continue the body's guide line, so the reason and actions share its left edge. */
  inline?: boolean
  approval: ToolCallApprovalRequest
  toolLabel: string
  onApprove?: ToolCallProps["onApprove"]
  onDeny?: ToolCallProps["onDeny"]
}) {
  const [always, setAlways] = React.useState(false)
  const [denying, setDenying] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (denying) inputRef.current?.focus({ preventScroll: true })
  }, [denying])

  return (
    <div
      data-slot="tool-call-approval"
      className={cn(
        "flex flex-col gap-2",
        inline
          ? "border-chatcn-border ms-[15.5px] mb-2 border-s ps-[17.5px] pt-3"
          : "border-chatcn-border/70 border-t p-1.5 pl-3.5",
      )}
    >
      {approval.reason ? (
        <p
          className={cn(
            "chatcn-text-13 text-chatcn-fg-muted pr-2 text-pretty",
            !inline && "pt-1.5",
          )}
        >
          {approval.reason}
        </p>
      ) : null}

      {denying ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            onDeny?.(approval.id, reason.trim() || undefined)
          }}
        >
          <input
            ref={inputRef}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation()
                setDenying(false)
              }
            }}
            placeholder="Tell the agent what to do instead..."
            aria-label="Reason for denying"
            className={cn(
              "rounded-chatcn-sm chatcn-text-13 text-chatcn-fg h-7 min-w-0 flex-1 bg-transparent px-1",
              "placeholder:text-chatcn-fg-subtle focus:outline-none",
            )}
          />
          <Button size="sm" onClick={() => setDenying(false)}>
            Back
          </Button>
          <Button type="submit" size="sm" variant="solid">
            Deny
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            role="switch"
            aria-checked={always}
            onClick={() => setAlways((v) => !v)}
            className={cn(
              "chatcn-focus group/always rounded-chatcn-sm mr-auto inline-flex h-7 min-w-0 items-center gap-2 pr-2",
              "chatcn-text-13 text-chatcn-fg-muted hover:text-chatcn-fg transition-colors duration-150",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-3.5 shrink-0 place-items-center rounded-[4px] shadow-[inset_0_0_0_1px_var(--chatcn-border-strong)]",
                "ease-chatcn-out transition-[background-color,box-shadow] duration-150 [&_svg]:size-3",
                always && "bg-chatcn-accent text-chatcn-accent-fg shadow-none",
              )}
            >
              <CheckIcon
                strokeWidth={2}
                className={cn(
                  "ease-chatcn-out transition-[opacity,scale] duration-150",
                  always ? "scale-100 opacity-100" : "scale-50 opacity-0",
                )}
              />
            </span>
            <span className="truncate">Always allow {toolLabel}</span>
          </button>
          <Button size="sm" onClick={() => setDenying(true)}>
            Deny
          </Button>
          <Button
            size="sm"
            variant="solid"
            onClick={() => onApprove?.(approval.id, always ? "always" : "once")}
          >
            Allow
          </Button>
        </div>
      )}
    </div>
  )
}
