import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import type * as React from "react"
import { popupMotion, popupSurface } from "@/components/ui/chatcn/popover"
import { CheckIcon, ChevronRightIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Geometry: a 12 px container with 4 px padding holds 8 px items, so the radii stay concentric.
 * Highlight is instant: menus are used too often for an animated hover.
 * -----------------------------------------------------------------------------------------------*/

const item = cn(
  "group/menu-item rounded-chatcn-md relative flex min-h-8 w-full cursor-default items-center gap-2 px-2 py-1.5",
  "chatcn-text-14 text-chatcn-fg text-start outline-none select-none",
  "data-[highlighted]:bg-chatcn-fill-hover data-[popup-open]:bg-chatcn-fill",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&>svg]:text-chatcn-fg-subtle data-[highlighted]:[&>svg]:text-chatcn-fg [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  "pointer-coarse:min-h-11",
)

/* -------------------------------------------------------------------------------------------------
 * Root and trigger
 * -----------------------------------------------------------------------------------------------*/

/** Root. Controlled with `open` and `onOpenChange`, or uncontrolled. Modal by default. */
function Menu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />
}

/** The button that opens the menu. Pass `render={<Button />}` to use your own element. */
function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

/* -------------------------------------------------------------------------------------------------
 * Content
 * -----------------------------------------------------------------------------------------------*/

interface MenuContentProps extends MenuPrimitive.Popup.Props {
  /** Default `bottom`. Flips when there is no room. */
  side?: MenuPrimitive.Positioner.Props["side"]
  /** Default `start`, so the menu lines up with the trigger's leading edge. */
  align?: MenuPrimitive.Positioner.Props["align"]
  /** Gap to the trigger in px. Default 6. */
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"]
  alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"]
  container?: MenuPrimitive.Portal.Props["container"]
}

/** The floating list. Portalled, positioned and at least as wide as its trigger. */
function MenuContent({
  side = "bottom",
  align = "start",
  sideOffset = 6,
  alignOffset = 0,
  container,
  className,
  ...props
}: MenuContentProps) {
  return (
    <MenuPrimitive.Portal container={container}>
      <MenuPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50 outline-none"
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            popupSurface,
            popupMotion,
            "chatcn-scroll min-w-[max(11rem,var(--anchor-width))] overflow-y-auto p-1",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Items
 * -----------------------------------------------------------------------------------------------*/

interface MenuItemProps extends MenuPrimitive.Item.Props {
  /** Indent the label to line up with items that have an icon. */
  inset?: boolean
}

/** An action. Put an icon first and a `MenuShortcut` last; both are styled for you. */
function MenuItem({ className, inset, ...props }: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(item, inset && "ps-8", className)}
      {...props}
    />
  )
}

/** Reserved slot at the end of the row, so checking an item never shifts its label. */
function IndicatorSlot({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="ms-auto grid size-4 shrink-0 place-items-center ps-1">
      {children}
    </span>
  )
}

/** A toggle. The check sits at the end of the row. */
function MenuCheckboxItem({
  className,
  children,
  ...props
}: MenuPrimitive.CheckboxItem.Props & { children?: React.ReactNode }) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menu-checkbox-item"
      className={cn(item, className)}
      {...props}
    >
      {children}
      <IndicatorSlot>
        <MenuPrimitive.CheckboxItemIndicator className="text-chatcn-fg grid place-items-center">
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </IndicatorSlot>
    </MenuPrimitive.CheckboxItem>
  )
}

/** Groups radio items. Controlled with `value` and `onValueChange`. */
function MenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />
}

/** One choice of a radio group. The check sits at the end of the row. */
function MenuRadioItem({
  className,
  children,
  ...props
}: MenuPrimitive.RadioItem.Props & { children?: React.ReactNode }) {
  return (
    <MenuPrimitive.RadioItem data-slot="menu-radio-item" className={cn(item, className)} {...props}>
      {children}
      <IndicatorSlot>
        <MenuPrimitive.RadioItemIndicator className="text-chatcn-fg grid place-items-center">
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </IndicatorSlot>
    </MenuPrimitive.RadioItem>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Structure
 * -----------------------------------------------------------------------------------------------*/

function MenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="menu-group" {...props} />
}

/** Names the group it sits in. Must be inside a `MenuGroup` or `MenuRadioGroup`. Sentence case. */
function MenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-label"
      className={cn(
        "chatcn-text-12 text-chatcn-fg-subtle flex h-7 items-center gap-1.5 px-2 font-medium select-none",
        "[&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  )
}

function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("bg-chatcn-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

/** Shortcut hint at the end of an item, for example `⌘K`. Decorative: the item stays the name. */
function MenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="menu-shortcut"
      aria-hidden="true"
      className={cn("chatcn-text-12 text-chatcn-fg-subtle ms-auto ps-3 tabular-nums", className)}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------------------------------
 * Submenu
 * -----------------------------------------------------------------------------------------------*/

/** Wraps a `MenuSubTrigger` and a `MenuSubContent`. */
function MenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot {...props} />
}

function MenuSubTrigger({
  className,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & { children?: React.ReactNode }) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="menu-sub-trigger"
      className={cn(item, className)}
      {...props}
    >
      {children}
      <ChevronRightIcon
        aria-hidden="true"
        className="text-chatcn-fg-subtle ms-auto size-4 shrink-0 ps-0.5 rtl:-scale-x-100"
      />
    </MenuPrimitive.SubmenuTrigger>
  )
}

/**
 * The nested list. Opens beside its trigger with the first item level with the trigger row.
 */
function MenuSubContent({
  side = "inline-end",
  align = "start",
  sideOffset = 2,
  alignOffset = -4,
  ...props
}: MenuContentProps) {
  return (
    <MenuContent
      side={side}
      align={align}
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      {...props}
    />
  )
}

export type { MenuContentProps, MenuItemProps }
export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
}
