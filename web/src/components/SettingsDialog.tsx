import { useEffect, useState } from "react";
import type { Mentor } from "@/hooks/use-mentor";
import type { CustomProvider } from "@/lib/api";
import { useBackHandler } from "@/lib/back";
import { ChevronDownIcon, PlusIcon, XIcon } from "@/lib/chatcn-icons";
import { runningBundleVersion } from "@/lib/updater";
import { cn } from "@/lib/utils";

const input =
  "h-9 w-full rounded-chatcn-sm border border-chatcn-border bg-chatcn-bg-subtle px-2.5 " +
  "chatcn-text-13 text-chatcn-fg placeholder:text-chatcn-fg-subtle outline-none " +
  "focus:border-chatcn-border-strong";

export function SettingsDialog({ mentor, onClose }: { mentor: Mentor; onClose: () => void }) {
  // Android back closes settings instead of backgrounding the app.
  useBackHandler(true, onClose);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [bundleVersion, setBundleVersion] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void runningBundleVersion().then((version) => {
      if (alive) setBundleVersion(version);
    });
    return () => {
      alive = false;
    };
  }, []);
  const [custom, setCustom] = useState({
    id: "",
    name: "",
    baseUrl: "https://ai-gateway.kilo.ai/api/v1",
    api: "openai-completions",
    apiKey: "",
    modelsText: "kilo-auto/free|Auto Free|128000|8192",
  });

  const isConfigured = (id: string) => mentor.configuredProviders.includes(id);

  async function saveKey(id: string) {
    const key = (keys[id] ?? "").trim();
    if (!key) return;
    setStatus("Saving...");
    try {
      await mentor.setApiKey(id, key);
      setKeys((prev) => ({ ...prev, [id]: "" }));
      setStatus("Key saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeKey(id: string) {
    try {
      await mentor.removeApiKey(id);
      setStatus("Key removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function addCustom() {
    if (!custom.id.trim()) {
      setStatus("Provider id is required.");
      return;
    }
    const models = custom.modelsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, name, contextWindow, maxTokens] = line.split("|").map((part) => part?.trim());
        return {
          id: id ?? "",
          name: name || id || "",
          input: ["text"],
          contextWindow: contextWindow ? Number(contextWindow) : 128000,
          maxTokens: maxTokens ? Number(maxTokens) : 8192,
        };
      })
      .filter((model) => model.id);
    const provider: CustomProvider = {
      id: custom.id.trim(),
      name: custom.name.trim() || custom.id.trim(),
      baseUrl: custom.baseUrl.trim(),
      api: custom.api.trim() || "openai-completions",
      apiKey: custom.apiKey.trim() || undefined,
      models,
    };
    setStatus("Saving provider...");
    try {
      await mentor.saveProvider(provider);
      setCustom((prev) => ({ ...prev, id: "", name: "", apiKey: "" }));
      setStatus("Provider saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-chatcn-card border-chatcn-border sheet-up flex h-[90vh] w-full flex-col overflow-hidden rounded-t-chatcn-xl border sm:h-auto sm:max-h-[86vh] sm:max-w-2xl sm:rounded-chatcn-xl">
        <div className="border-chatcn-border flex items-center justify-between border-b px-5 py-4">
          <h2 className="chatcn-text-15 text-chatcn-fg font-semibold">Providers & settings</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-settings"
            aria-label="Close settings"
            className="chatcn-focus rounded-chatcn-sm text-chatcn-fg-muted hover:bg-chatcn-fill-hover hover:text-chatcn-fg flex size-8 items-center justify-center"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="chatcn-scroll min-h-0 flex-1 space-y-8 overflow-y-auto p-5">
          {status ? (
            <p className="border-chatcn-border bg-chatcn-bg-subtle chatcn-text-13 text-chatcn-fg-muted rounded-chatcn-sm border px-3 py-2">
              {status}
            </p>
          ) : null}

          <section>
            <h3 className="chatcn-text-12 text-chatcn-fg-subtle mb-3 uppercase tracking-[0.08em]">
              Providers
            </h3>
            <div className="space-y-2.5">
              {mentor.presets.map((preset) => (
                <div
                  key={preset.id}
                  className="border-chatcn-border bg-chatcn-bg-subtle rounded-chatcn-lg border p-3.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="chatcn-text-14 text-chatcn-fg font-medium">{preset.name}</span>
                    {preset.free ? (
                      <span className="border-chatcn-border chatcn-text-12 text-chatcn-green rounded-full border px-1.5 py-0.5 uppercase tracking-wide">
                        free
                      </span>
                    ) : null}
                    <div className="flex-1" />
                    {isConfigured(preset.id) ? (
                      <span className="chatcn-text-12 text-chatcn-green">configured</span>
                    ) : null}
                  </div>
                  <p className="chatcn-text-12 text-chatcn-fg-subtle mt-1.5">{preset.blurb}</p>
                  <div className="mt-2.5 flex gap-2">
                    <input
                      type="password"
                      value={keys[preset.id] ?? ""}
                      onChange={(event) =>
                        setKeys((prev) => ({ ...prev, [preset.id]: event.target.value }))
                      }
                      placeholder={isConfigured(preset.id) ? "Replace key" : "Paste API key"}
                      className={input}
                    />
                    <button
                      type="button"
                      onClick={() => void saveKey(preset.id)}
                      className="bg-chatcn-fg text-chatcn-bg rounded-chatcn-sm chatcn-text-13 shrink-0 px-3 font-medium"
                    >
                      Save
                    </button>
                    {isConfigured(preset.id) ? (
                      <button
                        type="button"
                        onClick={() => void removeKey(preset.id)}
                        className="border-chatcn-border text-chatcn-fg-muted hover:text-chatcn-fg rounded-chatcn-sm chatcn-text-13 shrink-0 border px-3"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {mentor.customProviders.length ? (
            <section>
              <h3 className="chatcn-text-12 text-chatcn-fg-subtle mb-3 uppercase tracking-[0.08em]">
                Custom providers
              </h3>
              <div className="space-y-2">
                {mentor.customProviders.map((provider) => (
                  <div
                    key={provider.id}
                    className="border-chatcn-border bg-chatcn-bg-subtle rounded-chatcn-lg flex items-center gap-3 border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="chatcn-text-13 text-chatcn-fg">{provider.name}</div>
                      <div className="chatcn-text-12 text-chatcn-fg-subtle truncate font-mono">
                        {provider.baseUrl}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void mentor.deleteProvider(provider.id)}
                      className="border-chatcn-border text-chatcn-fg-muted hover:text-chatcn-red rounded-chatcn-sm chatcn-text-12 shrink-0 border px-3 py-1.5"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <button
              type="button"
              onClick={() => setShowCustom((value) => !value)}
              className="border-chatcn-border bg-chatcn-bg-subtle hover:bg-chatcn-fill-hover rounded-chatcn-lg flex w-full items-center justify-between border px-3.5 py-3 text-left transition-colors"
            >
              <span className="chatcn-text-13 text-chatcn-fg flex items-center gap-2">
                <PlusIcon className="size-3.5" />
                Add custom OpenAI-compatible provider
              </span>
              <ChevronDownIcon
                className={cn(
                  "text-chatcn-fg-subtle size-4 transition-transform",
                  showCustom && "rotate-180",
                )}
              />
            </button>

            {showCustom ? (
              <div className="border-chatcn-border bg-chatcn-bg-subtle rounded-chatcn-lg mt-2.5 space-y-2 border p-3.5">
                <input
                  value={custom.id}
                  onChange={(event) => setCustom((prev) => ({ ...prev, id: event.target.value }))}
                  placeholder="Provider id (e.g. kilo)"
                  className={input}
                />
                <input
                  value={custom.name}
                  onChange={(event) => setCustom((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Display name"
                  className={input}
                />
                <input
                  value={custom.baseUrl}
                  onChange={(event) =>
                    setCustom((prev) => ({ ...prev, baseUrl: event.target.value }))
                  }
                  placeholder="Base URL"
                  className={input}
                />
                <div className="flex gap-2">
                  <input
                    value={custom.api}
                    onChange={(event) =>
                      setCustom((prev) => ({ ...prev, api: event.target.value }))
                    }
                    placeholder="API"
                    className={input}
                  />
                  <input
                    value={custom.apiKey}
                    onChange={(event) =>
                      setCustom((prev) => ({ ...prev, apiKey: event.target.value }))
                    }
                    type="password"
                    placeholder="API key (optional)"
                    className={input}
                  />
                </div>
                <textarea
                  value={custom.modelsText}
                  onChange={(event) =>
                    setCustom((prev) => ({ ...prev, modelsText: event.target.value }))
                  }
                  rows={3}
                  placeholder="One model per line: id|name|contextWindow|maxTokens"
                  className="border-chatcn-border bg-chatcn-bg text-chatcn-fg placeholder:text-chatcn-fg-subtle rounded-chatcn-sm chatcn-text-12 w-full px-2.5 py-2 font-mono outline-none focus:border-chatcn-border-strong"
                />
                <button
                  type="button"
                  onClick={() => void addCustom()}
                  className="bg-chatcn-fg text-chatcn-bg rounded-chatcn-sm chatcn-text-13 px-4 py-2 font-medium"
                >
                  Add provider
                </button>
              </div>
            ) : null}
          </section>

          <section className="border-chatcn-border border-t pt-5">
            <p className="chatcn-text-12 text-chatcn-fg-subtle mb-4 font-mono">
              {bundleVersion ? `Running bundle ${bundleVersion}` : "Running the bundled app"}
            </p>
            <button
              type="button"
              onClick={() => {
                mentor.disconnect();
                onClose();
              }}
              className="chatcn-text-13 text-chatcn-red hover:underline"
            >
              Disconnect server
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}