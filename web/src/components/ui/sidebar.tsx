import type * as React from "react"
import { cn } from "@/lib/utils"

/**
 * shadcn-style sidebar primitives, wired to the `--sidebar-*` tokens. The rail
 * is a surface of its own: a header that holds the brand and search, a scrolling
 * content well of grouped menus, and a fixed footer for the primary actions.
 */

function Sidebar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar"
      className={cn(
        "bg-sidebar text-sidebar-foreground flex h-full min-h-0 flex-col",
        className,
      )}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex shrink-0 flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("flex shrink-0 items-center gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("flex min-h-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

/** A small uppercase caption above a menu group. Optionally sticky while the group scrolls. */
function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "text-sidebar-foreground/50 flex h-6 shrink-0 items-center px-2 text-[0.6875rem] font-medium tracking-[0.08em] uppercase",
        className,
      )}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("m-0 flex list-none flex-col gap-0.5 p-0", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("relative", className)} {...props} />
}

/**
 * A menu row. `active` fills it with the sidebar accent, matching shadcn's
 * `data-active` state. Rendered as a button; use `asChild`-style markup for
 * inert rows by passing a `div`-friendly `render` is not needed here.
 */
function SidebarMenuButton({
  active,
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type={type}
      data-slot="sidebar-menu-button"
      data-active={active ? "" : undefined}
      className={cn(
        "chatcn-focus text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        "data-[active]:bg-sidebar-accent data-[active]:text-sidebar-foreground",
        "ease-chatcn-standard flex h-8 w-full min-w-0 items-center gap-2.5 rounded-md px-2 text-start text-sm transition-colors duration-150",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  )
}

/** A quiet icon button used in the sidebar header and on hovered rows. */
function SidebarAction({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      data-slot="sidebar-action"
      className={cn(
        "chatcn-focus text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        "[&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  )
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-separator"
      role="separator"
      className={cn("bg-sidebar-border mx-2 h-px shrink-0", className)}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarAction,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
}
