import type * as React from "react"
import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "rounded-chatcn-xs bg-chatcn-fill chatcn-text-12 text-chatcn-fg-subtle inline-flex h-5 min-w-5 items-center justify-center px-1 font-sans tabular-nums shadow-[inset_0_-1px_0_var(--chatcn-alpha-300)]",
        className,
      )}
      {...props}
    />
  )
}

export { Kbd }
