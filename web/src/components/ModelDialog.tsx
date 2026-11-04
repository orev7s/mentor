import { useMemo, useState } from "react";
import type { Mentor } from "@/hooks/use-mentor";
import { modelRef, type ModelSummary } from "@/lib/api";
import { CheckIcon, SearchIcon, XIcon } from "@/lib/chatcn-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/chatcn/dialog";
import { cn } from "@/lib/utils";

/** A quiet capability pill on a model row. */
function Badge({ children, tone }: { children: React.ReactNode; tone?: "ready" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide uppercase",
        tone === "ready"
          ? "border-chatcn-green-border text-chatcn-green"
          : "border-chatcn-border text-chatcn-fg-subtle",
      )}
    >
      {children}
    </span>
  );
}

export function ModelDialog({
  mentor,
  onClose,
}: {
  mentor: Mentor;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const configured = mentor.configuredProviders;

  const groups = useMemo(() => {
    const query = search.toLowerCase().trim();
    const source = showAll
      ? mentor.models
      : mentor.models.filter((item) => configured.includes(item.provider));
    const filtered = source.filter(
      (item) =>
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        item.provider.toLowerCase().includes(query),
    );
    const map = new Map<string, ModelSummary[]>();
    for (const item of filtered.slice(0, 600)) {
      const list = map.get(item.provider) ?? [];
      list.push(item);
      map.set(item.provider, list);
    }
    return [...map.entries()].sort((a, b) => {
      const ca = configured.includes(a[0]) ? 0 : 1;
      const cb = configured.includes(b[0]) ? 0 : 1;
      return ca - cb || a[0].localeCompare(b[0]);
    });
  }, [configured, mentor.models, search, showAll]);

  const providerLabel = (id: string) =>
    mentor.presets.find((preset) => preset.id === id)?.name ?? id.replace(/-/g, " ");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        size="lg"
        showClose={false}
        className="max-h-[min(80dvh,34rem)] gap-0 p-0 sm:max-w-lg"
      >
        <div className="border-chatcn-border flex items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="chatcn-text-14">Choose a model</DialogTitle>
            <DialogDescription className="chatcn-text-12 mt-0.5">
              {configured.length
                ? "Models from your configured providers."
                : "Add a provider key in settings to unlock models."}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-model-picker"
            aria-label="Close"
            className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex size-8 shrink-0 items-center justify-center"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="border-chatcn-border border-b px-3 py-1.5">
          <div className="bg-chatcn-bg-subtle border-chatcn-border focus-within:border-chatcn-border-strong flex h-8 items-center gap-2 rounded-chatcn-md border px-2.5 transition-colors">
            <SearchIcon className="text-chatcn-fg-subtle size-3.5 shrink-0" />
            <input
              autoFocus
              data-testid="model-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search models"
              className="chatcn-text-13 text-chatcn-fg placeholder:text-chatcn-fg-subtle h-full min-w-0 flex-1 bg-transparent outline-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="text-chatcn-fg-subtle hover:text-chatcn-fg flex size-5 shrink-0 items-center justify-center"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="chatcn-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
          {groups.map(([provider, models]) => {
            const ready = configured.includes(provider);
            return (
              <div key={provider} className="mb-1.5">
                <div className="text-chatcn-fg-subtle flex items-center gap-2 px-2 py-1 text-[0.6875rem] font-medium tracking-[0.08em] uppercase">
                  <span className="truncate">{providerLabel(provider)}</span>
                  {ready ? <Badge tone="ready">ready</Badge> : null}
                  <span className="flex-1" />
                  <span className="text-chatcn-fg-faint tabular-nums">{models.length}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {models.map((item) => {
                    const ref = modelRef(item);
                    const selected = mentor.model === ref;
                    return (
                      <button
                        key={ref}
                        type="button"
                        onClick={() => {
                          mentor.setModel(ref);
                          onClose();
                        }}
                        className={cn(
                          "chatcn-focus rounded-chatcn-md flex h-9 w-full min-w-0 items-center gap-2.5 px-2.5 text-start transition-colors",
                          selected ? "bg-chatcn-fill" : "hover:bg-chatcn-fill-hover",
                        )}
                      >
                        <span className="chatcn-text-13 text-chatcn-fg min-w-0 flex-1 truncate font-medium">
                          {item.name}
                        </span>
                        <span className="chatcn-text-12 text-chatcn-fg-subtle hidden max-w-[38%] min-w-0 truncate font-mono sm:block">
                          {item.id}
                        </span>
                        <span className="text-chatcn-fg-subtle flex shrink-0 items-center gap-1.5">
                          {item.input.includes("image") ? <Badge>vision</Badge> : null}
                          {item.contextWindow ? (
                            <span className="chatcn-text-12 tabular-nums">
                              {`${(item.contextWindow / 1000).toFixed(0)}k`}
                            </span>
                          ) : null}
                          <span className="flex size-4 items-center justify-center">
                            {selected ? <CheckIcon className="text-chatcn-fg size-4" /> : null}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {groups.length === 0 ? (
            <p className="chatcn-text-13 text-chatcn-fg-subtle px-3 py-10 text-center">
              {showAll ? "No models match." : "No models yet. Add a provider key in settings."}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="chatcn-focus chatcn-text-12 text-chatcn-fg-muted hover:text-chatcn-fg border-chatcn-border hover:bg-chatcn-fill-hover flex shrink-0 items-center justify-center border-t px-4 py-2 font-medium transition-colors"
        >
          {showAll ? "Show only ready providers" : `Show all ${mentor.models.length} models`}
        </button>
      </DialogContent>
    </Dialog>
  );
}
