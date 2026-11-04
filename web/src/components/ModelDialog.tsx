import { useMemo, useState } from "react";
import type { Mentor } from "@/hooks/use-mentor";
import { modelRef, type ModelSummary } from "@/lib/api";
import { CheckIcon, SearchIcon, XIcon } from "@/lib/chatcn-icons";
import { cn } from "@/lib/utils";

export function ModelDialog({
  mentor,
  onClose,
}: {
  mentor: Mentor;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const groups = useMemo(() => {
    const query = search.toLowerCase().trim();
    const source = showAll
      ? mentor.models
      : mentor.models.filter((item) => mentor.configuredProviders.includes(item.provider));
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
      const ca = mentor.configuredProviders.includes(a[0]) ? 0 : 1;
      const cb = mentor.configuredProviders.includes(b[0]) ? 0 : 1;
      return ca - cb || a[0].localeCompare(b[0]);
    });
  }, [mentor.configuredProviders, mentor.models, search, showAll]);

  const providerLabel = (id: string) =>
    mentor.presets.find((preset) => preset.id === id)?.name ?? id.replace(/-/g, " ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-chatcn-card border-chatcn-border sheet-up flex h-[85vh] w-full flex-col overflow-hidden rounded-t-chatcn-xl border sm:h-auto sm:max-h-[80vh] sm:max-w-xl sm:rounded-chatcn-xl">
        <div className="border-chatcn-border flex items-center gap-2 border-b p-3">
          <div className="bg-chatcn-bg-subtle border-chatcn-border flex flex-1 items-center gap-2 rounded-chatcn-md border px-2.5">
            <SearchIcon className="text-chatcn-fg-subtle size-3.5 shrink-0" />
            <input
              autoFocus
              data-testid="model-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search models"
              className="chatcn-text-13 text-chatcn-fg placeholder:text-chatcn-fg-subtle h-9 w-full bg-transparent outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-model-picker"
            aria-label="Close"
            className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex size-8 items-center justify-center"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="chatcn-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {groups.map(([provider, models]) => (
            <div key={provider} className="mb-2">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="chatcn-text-12 text-chatcn-fg-subtle uppercase tracking-[0.08em]">
                  {providerLabel(provider)}
                </span>
                {mentor.configuredProviders.includes(provider) ? (
                  <span className="border-chatcn-border chatcn-text-12 text-chatcn-green rounded-full border px-1.5 py-0.5 uppercase tracking-wide">
                    ready
                  </span>
                ) : null}
              </div>
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
                      "chatcn-focus rounded-chatcn-sm flex w-full min-w-0 items-center gap-3 px-2 py-2 text-start transition-colors",
                      selected ? "bg-chatcn-fill" : "hover:bg-chatcn-fill-hover",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="chatcn-text-13 text-chatcn-fg block truncate">
                        {item.name}
                      </span>
                      <span className="chatcn-text-12 text-chatcn-fg-subtle block truncate font-mono">
                        {item.id}
                      </span>
                    </span>
                    <span className="text-chatcn-fg-subtle flex shrink-0 items-center gap-2">
                      {item.input.includes("image") ? (
                        <span className="border-chatcn-border chatcn-text-12 rounded border px-1.5 py-0.5">
                          vision
                        </span>
                      ) : null}
                      <span className="chatcn-text-12 tabular-nums">
                        {item.contextWindow
                          ? `${(item.contextWindow / 1000).toFixed(0)}k`
                          : ""}
                      </span>
                      {selected ? <CheckIcon className="text-chatcn-fg size-3.5" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {groups.length === 0 ? (
            <p className="chatcn-text-13 text-chatcn-fg-subtle px-3 py-8 text-center">
              {showAll
                ? "No models match."
                : "No models yet. Add a provider key in settings."}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="chatcn-text-12 text-chatcn-fg-muted hover:text-chatcn-fg border-chatcn-border flex shrink-0 items-center justify-center border-t px-4 py-3 transition-colors"
        >
          {showAll
            ? "Show only ready providers"
            : `Show all ${mentor.models.length} models`}
        </button>
      </div>
    </div>
  );
}