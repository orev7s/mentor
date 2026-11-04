import type * as React from "react"
import { Suggestion, Suggestions } from "@/components/ui/chatcn/suggestions"
import { cn } from "@/lib/utils"

interface EmptyStateSuggestion {
  label: string
  /** The full prompt, when it differs from the label. */
  prompt?: string
  icon?: React.ReactNode
}

interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** The greeting: "Good evening, Daniel". */
  title: React.ReactNode
  /** One line under the greeting. */
  description?: React.ReactNode
  /** The composer. Rendered between the greeting and the suggestions. */
  composer?: React.ReactNode
  /** Up to four starters. More are ignored: a long menu is a worse start than a blank field. */
  suggestions?: EmptyStateSuggestion[]
  onSuggestion?: (prompt: string) => void
  /** `center` sits in the middle of the space, `top` starts a third of the way down, aligned to the start. */
  align?: "center" | "top"
}

/**
 * The first screen of a chat: a greeting, one line, the composer and up to four suggestions.
 * No illustration and no logo. The greeting fades in once; suggestions stagger once.
 */
function EmptyState({
  title,
  description,
  composer,
  suggestions = [],
  onSuggestion,
  align = "center",
  className,
  children,
  ...props
}: EmptyStateProps) {
  const centered = align === "center"
  const items = suggestions.slice(0, 4)

  return (
    <div
      data-slot="empty-state"
      data-align={align}
      className={cn(
        "mx-auto flex w-full max-w-[720px] flex-1 flex-col px-4 sm:px-6",
        // Optical center: 24 px above the true middle, where a centered block looks centered.
        centered
          ? "items-center justify-center pt-12 pb-24 text-center"
          : "items-start pt-[14vh] pb-12",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "flex flex-col gap-2",
          centered && "items-center",
          "ease-chatcn-out transition-[opacity,translate] duration-300 starting:translate-y-1 starting:opacity-0",
          "motion-reduce:starting:translate-y-0",
        )}
      >
        <h2 className="chatcn-text-24 sm:chatcn-text-32 text-chatcn-fg font-medium text-balance">
          {title}
        </h2>
        {description ? (
          <p className="chatcn-text-15 text-chatcn-fg-muted max-w-[52ch] text-pretty">
            {description}
          </p>
        ) : null}
      </div>

      {composer ? <div className="mt-8 w-full text-start">{composer}</div> : null}

      {items.length > 0 ? (
        <Suggestions
          variant={centered ? "chips" : "rows"}
          className={cn(
            composer ? "mt-4" : "mt-8",
            centered ? "items-center [&>[role=group]]:justify-center" : "w-full",
          )}
        >
          {items.map((item) => (
            <Suggestion
              key={item.label}
              icon={item.icon}
              value={item.prompt ?? item.label}
              onSelect={onSuggestion}
            >
              {item.label}
            </Suggestion>
          ))}
        </Suggestions>
      ) : null}

      {children}
    </div>
  )
}

export type { EmptyStateProps, EmptyStateSuggestion }
export { EmptyState }
