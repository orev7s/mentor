import { Menu } from "@base-ui/react/menu"
import type * as React from "react"
import { Button, type ButtonProps } from "@/components/ui/chatcn/button"
import { CopyButton, type CopyButtonProps } from "@/components/ui/chatcn/copy-button"
import { useMessage } from "@/components/ui/chatcn/message"
import { Tooltip } from "@/components/ui/chatcn/tooltip"
import { EllipsisIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * MessageActions
 * -----------------------------------------------------------------------------------------------*/

interface MessageActionsProps extends React.ComponentProps<"div"> {
  /**
   * Keep the toolbar visible. Defaults to the message's `latest` flag. Older messages reveal
   * their actions on hover or focus, instantly, and always on touch screens.
   */
  visible?: boolean
}

/**
 * Toolbar under a message. Reveal is instant because it happens hundreds of times a day; an
 * animation there only adds lag.
 */
function MessageActions({ visible, className, children, ...props }: MessageActionsProps) {
  const ctx = useMessage()
  const pinned = visible ?? ctx?.latest ?? true
  // A streaming reply has nothing to act on yet.
  if (ctx?.state === "streaming") return null

  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      data-slot="message-actions"
      data-pinned={pinned ? "" : undefined}
      className={cn(
        "-ms-1.5 flex min-h-7 flex-wrap items-center gap-0.5",
        ctx?.layout === "bubble" && "ms-0 -me-1.5 justify-end",
        !pinned &&
          cn(
            "opacity-0 group-focus-within/message:opacity-100 group-hover/message:opacity-100",
            // Stay put while a menu or popover opened from here is open, and on touch screens.
            "has-[[data-popup-open]]:opacity-100 pointer-coarse:opacity-100",
          ),
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------------------------------
 * MessageAction
 * -----------------------------------------------------------------------------------------------*/

interface MessageActionProps extends Omit<ButtonProps, "children"> {
  /** Accessible name and tooltip text: a specific verb such as "Retry response". */
  label: string
  /** Shortcut hint shown in the tooltip. */
  shortcut?: React.ReactNode
  children: React.ReactNode
}

const actionClass = cn(
  "text-chatcn-fg-subtle hover:text-chatcn-fg",
  // 28 px visual, 44 px hit area on touch.
  "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']",
)

/** An icon button with a tooltip. Pass the icon as children. */
function MessageAction({
  label,
  shortcut,
  size = "icon-sm",
  className,
  children,
  ...props
}: MessageActionProps) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <Button
        size={size}
        aria-label={label}
        data-slot="message-action"
        className={cn(actionClass, className)}
        {...props}
      >
        {children}
      </Button>
    </Tooltip>
  )
}

/* -------------------------------------------------------------------------------------------------
 * MessageActionCopy
 * -----------------------------------------------------------------------------------------------*/

/** Copy with the kit's copy-to-check swap, in the toolbar's size and tone. */
function MessageActionCopy({ label = "Copy", className, ...props }: CopyButtonProps) {
  return (
    <Tooltip content={label}>
      <CopyTrigger
        label={label}
        data-slot="message-action"
        className={cn(actionClass, className)}
        {...props}
      />
    </Tooltip>
  )
}

/**
 * CopyButton spreads its props after its own click handler, so the tooltip trigger's onClick
 * would replace the copy. Run both instead.
 */
function CopyTrigger({ onClick, onCopy, ...props }: CopyButtonProps) {
  return <CopyButton {...props} onCopy={onCopy} onClickCapture={(event) => onClick?.(event)} />
}

/* -------------------------------------------------------------------------------------------------
 * MessageActionMenu
 * -----------------------------------------------------------------------------------------------*/

interface MessageActionMenuItem {
  label: string
  icon?: React.ReactNode
  onSelect?: () => void
  disabled?: boolean
}

interface MessageActionMenuProps {
  items: MessageActionMenuItem[]
  /** Trigger label. Defaults to "More actions". */
  label?: string
  /** Trigger icon. Defaults to an ellipsis. */
  icon?: React.ReactNode
  align?: "start" | "center" | "end"
}

/** The overflow menu for rarer actions: branch, read aloud, report. */
function MessageActionMenu({
  items,
  label = "More actions",
  icon,
  align = "start",
}: MessageActionMenuProps) {
  return (
    <Menu.Root>
      <Tooltip content={label}>
        <Menu.Trigger
          aria-label={label}
          data-slot="message-action"
          render={
            <Button
              size="icon-sm"
              className={cn(
                actionClass,
                "data-[popup-open]:bg-chatcn-fill-hover data-[popup-open]:text-chatcn-fg",
              )}
            />
          }
        >
          {icon ?? <EllipsisIcon />}
        </Menu.Trigger>
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align={align} sideOffset={4} className="z-50 outline-none">
          <Menu.Popup
            data-slot="message-action-menu"
            className={cn(
              "rounded-chatcn-lg bg-chatcn-surface shadow-chatcn-lg min-w-44 origin-(--transform-origin) p-1 outline-none",
              "ease-chatcn-out transition-[opacity,scale,translate] duration-180",
              "data-[starting-style]:-translate-y-1 data-[starting-style]:scale-96 data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-98 data-[ending-style]:opacity-0 data-[ending-style]:duration-140",
              // Opened from the keyboard, or with reduced motion: no animation.
              "data-[instant]:transition-none motion-reduce:transition-none",
            )}
          >
            {items.map((item) => (
              <Menu.Item
                key={item.label}
                disabled={item.disabled}
                onClick={item.onSelect}
                className={cn(
                  "rounded-chatcn-sm chatcn-text-13 text-chatcn-fg flex h-8 cursor-default items-center gap-2.5 px-2 outline-none select-none",
                  "data-[highlighted]:bg-chatcn-fill-hover data-[disabled]:opacity-50",
                  "[&_svg]:text-chatcn-fg-subtle [&_svg]:size-4 [&_svg]:shrink-0",
                  "pointer-coarse:h-11",
                )}
              >
                {item.icon}
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

export type {
  MessageActionMenuItem,
  MessageActionMenuProps,
  MessageActionProps,
  MessageActionsProps,
}
export { MessageAction, MessageActionCopy, MessageActionMenu, MessageActions }
