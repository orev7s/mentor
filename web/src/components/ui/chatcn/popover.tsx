"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------------------------------
 * Motion
 *
 * Enter: opacity, scale from 0.96 and 4 px of travel away from the trigger, 180 ms ease-chatcn-out,
 * growing out of the trigger through `--transform-origin`. Exit: 140 ms to scale 0.98, no travel.
 * Opened or dismissed with the keyboard, Base UI sets `data-instant` and nothing animates.
 * Reduced motion keeps the fade and drops scale and travel.
 * -----------------------------------------------------------------------------------------------*/

const popupMotion = cn(
  "ease-chatcn-out origin-(--transform-origin) transition-[opacity,scale,translate] duration-180",
  "data-[starting-style]:scale-96 data-[starting-style]:opacity-0",
  "data-[side=bottom]:data-[starting-style]:-translate-y-1 data-[side=top]:data-[starting-style]:translate-y-1",
  "data-[side=left]:data-[starting-style]:translate-x-1 data-[side=right]:data-[starting-style]:-translate-x-1",
  "data-[side=inline-end]:data-[starting-style]:-translate-x-1 data-[side=inline-start]:data-[starting-style]:translate-x-1",
  "data-[ending-style]:scale-98 data-[ending-style]:opacity-0 data-[ending-style]:duration-140",
  "data-[instant]:transition-none",
  "motion-reduce:translate-none! motion-reduce:scale-none!",
)

/** Surface shared by popovers and menus: 12 px radius, surface fill, medium shadow. */
const popupSurface = cn(
  "bg-chatcn-surface text-chatcn-fg shadow-chatcn-md rounded-chatcn-lg outline-none",
  "max-h-(--available-height) max-w-(--available-width)",
  // Shadows vanish in forced colors; keep an edge.
  "forced-colors:outline-1 forced-colors:outline-solid",
)

/* -------------------------------------------------------------------------------------------------
 * Parts
 * -----------------------------------------------------------------------------------------------*/

/**
 * Root. Controlled with `open` and `onOpenChange`, or uncontrolled with `defaultOpen`.
 * Not modal by default: the page stays scrollable and clickable.
 */
function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />
}

/** The button that toggles the popover. Pass `render={<Button />}` to use your own element. */
function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

interface PopoverContentProps extends PopoverPrimitive.Popup.Props {
  /** Side of the trigger to open on. Flips when there is no room. Default `bottom`. */
  side?: PopoverPrimitive.Positioner.Props["side"]
  /** Alignment along that side. Default `center`. */
  align?: PopoverPrimitive.Positioner.Props["align"]
  /** Gap to the trigger in px. Default 6. */
  sideOffset?: PopoverPrimitive.Positioner.Props["sideOffset"]
  alignOffset?: PopoverPrimitive.Positioner.Props["alignOffset"]
  /** Element to position against instead of the trigger. */
  anchor?: PopoverPrimitive.Positioner.Props["anchor"]
  /** Portal container. Defaults to `document.body`. */
  container?: PopoverPrimitive.Portal.Props["container"]
}

/**
 * The floating panel. Portalled and positioned for you. Padding defaults to 4 px, the right inset
 * for lists; pass `className="p-3"` for text content.
 */
function PopoverContent({
  side = "bottom",
  align = "center",
  sideOffset = 6,
  alignOffset = 0,
  anchor,
  container,
  className,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-50 outline-none"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            popupSurface,
            popupMotion,
            "chatcn-text-14 chatcn-scroll overflow-auto p-1",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

/** Labels the popover for assistive tech. */
function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("chatcn-text-14 text-chatcn-fg font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("chatcn-text-13 text-chatcn-fg-muted text-pretty", className)}
      {...props}
    />
  )
}

/** Closes the popover. Renders a button; pass `render` to use your own. */
function PopoverClose(props: PopoverPrimitive.Close.Props) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

export type { PopoverContentProps }
export {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  popupMotion,
  popupSurface,
}
