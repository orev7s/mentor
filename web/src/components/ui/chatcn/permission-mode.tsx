"use client"

import * as React from "react"
import { Button } from "@/components/ui/chatcn/button"
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/chatcn/menu"
import { ChevronDownIcon, HandIcon, ListChecksIcon, PencilIcon, ZapIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Modes
 * -----------------------------------------------------------------------------------------------*/

interface PermissionModeOption {
  id: string
  /** Short label for the trigger and the menu, for example "Ask before edits". */
  label: string
  icon: React.ReactNode
  /** One line in the menu under the label. */
  description?: string
  /**
   * The agent acts without asking in this mode. The trigger inverts so nobody forgets it is on,
   * and picking it asks for confirmation once per session.
   */
  risky?: boolean
  disabled?: boolean
}

/** The usual three. Add `fullAccessMode` or your own to extend them. */
const permissionModes: PermissionModeOption[] = [
  {
    id: "ask",
    label: "Ask before edits",
    icon: <HandIcon />,
    description: "Reads freely. Asks before it edits a file or runs a command.",
  },
  {
    id: "auto",
    label: "Edit automatically",
    icon: <PencilIcon />,
    description: "Edits files without asking. Still asks before commands.",
  },
  {
    id: "plan",
    label: "Plan only",
    icon: <ListChecksIcon />,
    description: "Reads and writes a plan. Changes nothing until you approve.",
  },
]

/** Opt-in fourth mode. Marked risky: the trigger inverts and choosing it asks once. */
const fullAccessMode: PermissionModeOption = {
  id: "full",
  label: "Full access",
  icon: <ZapIcon />,
  description: "Edits and runs commands without asking. Use in a sandbox.",
  risky: true,
}

/** The mode after `value`, wrapping around. Bind it to Shift+Tab in the composer. */
function nextPermissionMode(modes: PermissionModeOption[], value: string) {
  const enabled = modes.filter((m) => !m.disabled)
  if (enabled.length === 0) return value
  const i = enabled.findIndex((m) => m.id === value)
  return enabled[(i + 1) % enabled.length]?.id ?? value
}

/* -------------------------------------------------------------------------------------------------
 * PermissionMode
 * -----------------------------------------------------------------------------------------------*/

interface PermissionModeProps {
  modes?: PermissionModeOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /**
   * Called before a risky mode turns on. Return false (or resolve false) to stay put. Defaults to
   * an inline confirmation inside the menu, shown once per mount.
   */
  confirmRisky?: (mode: PermissionModeOption) => boolean | Promise<boolean>
  /** Hide the label and show the icon only, for very narrow composers. */
  iconOnly?: boolean
  disabled?: boolean
  side?: "top" | "bottom"
  className?: string
}

/**
 * Compact permission selector for the composer: Ask before edits, Edit automatically, Plan only.
 * The trigger shows the current mode as an icon and a short label. A risky mode inverts the
 * trigger, so the state is legible at a glance without a color.
 */
function PermissionMode({
  modes = permissionModes,
  value: valueProp,
  defaultValue,
  onValueChange,
  confirmRisky,
  iconOnly = false,
  disabled,
  side = "top",
  className,
}: PermissionModeProps) {
  const [valueState, setValueState] = React.useState(defaultValue ?? modes[0]?.id ?? "")
  const value = valueProp ?? valueState
  const current = modes.find((m) => m.id === value) ?? modes[0]
  const [open, setOpen] = React.useState(false)
  const [confirming, setConfirming] = React.useState<PermissionModeOption>()
  const confirmed = React.useRef(new Set<string>())

  const commit = (id: string) => {
    if (valueProp === undefined) setValueState(id)
    onValueChange?.(id)
  }

  const choose = async (id: string) => {
    const mode = modes.find((m) => m.id === id)
    if (!mode || id === value) return
    if (mode.risky && !confirmed.current.has(id)) {
      if (confirmRisky) {
        setOpen(false)
        if (await confirmRisky(mode)) {
          confirmed.current.add(id)
          commit(id)
        }
        return
      }
      setConfirming(mode)
      return
    }
    commit(id)
    setOpen(false)
  }

  if (!current) return null
  const risky = current.risky === true

  return (
    <Menu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setConfirming(undefined)
      }}
    >
      <MenuTrigger
        disabled={disabled}
        aria-label={iconOnly ? `Permissions: ${current.label}` : undefined}
        render={
          <Button
            variant="ghost"
            size="sm"
            data-slot="permission-mode-trigger"
            data-permission-mode={current.id}
            data-risky={risky ? "" : undefined}
            className={cn(
              "gap-1.5 ps-2 pe-1.5 pointer-coarse:h-11",
              "data-[popup-open]:bg-chatcn-fill-hover data-[popup-open]:text-chatcn-fg",
              risky &&
                "bg-chatcn-fg text-chatcn-bg hover:bg-chatcn-gray-900 hover:text-chatcn-bg data-[popup-open]:bg-chatcn-gray-900 data-[popup-open]:text-chatcn-bg",
              iconOnly && "pe-1",
              className,
            )}
          />
        }
      >
        <span
          key={current.id}
          aria-hidden="true"
          className="grid place-items-center motion-safe:animate-[chatcn-swap_150ms_var(--chatcn-ease-out)]"
        >
          {current.icon}
        </span>
        {iconOnly ? null : <span className="truncate">{current.label}</span>}
        <ChevronDownIcon
          aria-hidden="true"
          className={cn("opacity-60", risky ? "text-chatcn-bg" : "text-chatcn-fg-subtle")}
        />
      </MenuTrigger>
      <MenuContent side={side} className="w-80">
        {confirming ? (
          <RiskyConfirm
            mode={confirming}
            onCancel={() => setConfirming(undefined)}
            onConfirm={() => {
              confirmed.current.add(confirming.id)
              commit(confirming.id)
              setConfirming(undefined)
              setOpen(false)
            }}
          />
        ) : (
          <MenuRadioGroup value={value} onValueChange={(id) => void choose(id as string)}>
            <MenuGroup>
              <MenuLabel>Permissions</MenuLabel>
              {modes.map((mode) => (
                <MenuRadioItem
                  key={mode.id}
                  value={mode.id}
                  disabled={mode.disabled}
                  closeOnClick={false}
                  className="items-start gap-2.5 py-2"
                >
                  <span
                    aria-hidden="true"
                    className="text-chatcn-fg-subtle group-data-[highlighted]/menu-item:text-chatcn-fg mt-px grid shrink-0 place-items-center"
                  >
                    {mode.icon}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5">
                      {mode.label}
                      {mode.risky ? (
                        <span className="chatcn-text-12 text-chatcn-fg-subtle">No approvals</span>
                      ) : null}
                    </span>
                    {mode.description ? (
                      <span className="chatcn-text-12 text-chatcn-fg-subtle text-pretty">
                        {mode.description}
                      </span>
                    ) : null}
                  </span>
                </MenuRadioItem>
              ))}
            </MenuGroup>
          </MenuRadioGroup>
        )}
      </MenuContent>
    </Menu>
  )
}

/** Inline confirmation inside the menu. Focus moves to Cancel, the safe choice. */
function RiskyConfirm({
  mode,
  onCancel,
  onConfirm,
}: {
  mode: PermissionModeOption
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  // Unique per instance: two composers on one page must not share a label id.
  const titleId = React.useId()
  React.useEffect(() => cancelRef.current?.focus({ preventScroll: true }), [])
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add form semantics inside a menu
    <div
      role="group"
      aria-labelledby={titleId}
      data-slot="permission-mode-confirm"
      className="flex flex-col gap-3 p-2"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="flex flex-col gap-1">
        <p id={titleId} className="chatcn-text-14 text-chatcn-fg font-medium">
          Turn on {mode.label.toLowerCase()}?
        </p>
        <p className="chatcn-text-13 text-chatcn-fg-muted text-pretty">
          The agent will edit files and run commands without asking. Hard blocks still apply.
        </p>
      </div>
      <div className="flex justify-end gap-1.5">
        <Button ref={cancelRef} size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="solid" onClick={onConfirm}>
          Turn on
        </Button>
      </div>
    </div>
  )
}

export type { PermissionModeOption, PermissionModeProps }
export { fullAccessMode, nextPermissionMode, PermissionMode, permissionModes }
