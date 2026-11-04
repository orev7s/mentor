import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AnyModel, Api, Model } from "@earendil-works/pi-ai";
import { ensureDirs, paths } from "../config.js";
import { providerIdsWithKey, readModelsFile } from "../providers.js";

let runtimePromise: Promise<ModelRuntime> | undefined;

export function getRuntime(): Promise<ModelRuntime> {
  runtimePromise ??= (async () => {
    ensureDirs();
    return ModelRuntime.create({
      authPath: paths.auth,
      modelsPath: paths.models,
      allowModelNetwork: false,
    });
  })();
  return runtimePromise;
}

/** Drop the cached runtime so provider/model edits take effect. */
export async function resetRuntime(): Promise<ModelRuntime> {
  runtimePromise = undefined;
  return getRuntime();
}

export interface ModelSummary {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  /**
   * True when the model can run with thinking turned off. Some reasoning models
   * only exist in a thinking mode, so the Think control is hidden for them.
   */
  canDisableThinking: boolean;
  contextWindow: number;
  maxTokens: number;
  input: string[];
  configured: boolean;
}

export async function listModels(): Promise<ModelSummary[]> {
  const runtime = await getRuntime();
  const configured = providerIdsWithKey();
  // Pi reports defaults (0 / empty) for custom models, so fall back to what the
  // user declared in models.json.
  const declared = new Map<string, { contextWindow?: number; maxTokens?: number; input?: string[]; reasoning?: boolean }>();
  for (const provider of Object.values(readModelsFile().providers)) {
    for (const model of provider.models ?? []) {
      declared.set(`${provider.id}|${model.id}`, model);
    }
  }
  return runtime
    .getModels()
    .map((model: AnyModel) => {
      const extra = declared.get(`${model.provider}|${model.id}`);
      const chat = model.type === "chat";
      const reasoning = (chat && model.reasoning) || Boolean(extra?.reasoning);
      // `null` on the "off" entry means the provider has no non-thinking mode.
      const thinkingMap = (model as { thinkingLevelMap?: { off?: string | null } })
        .thinkingLevelMap;
      const offSupported = thinkingMap?.off !== null;
      return {
        provider: model.provider,
        id: model.id,
        name: model.name,
        reasoning,
        canDisableThinking: reasoning && offSupported,
        contextWindow: (chat ? model.contextWindow : 0) || extra?.contextWindow || 0,
        maxTokens: (chat ? model.maxTokens : 0) || extra?.maxTokens || 0,
        input: (chat && model.input.length ? model.input : extra?.input) ?? [],
        configured: configured.has(model.provider),
      };
    })
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
}

/** Resolve "provider/modelId" (modelId may itself contain slashes). */
export async function resolveModelRef(ref: string): Promise<Model<Api> | undefined> {
  const slash = ref.indexOf("/");
  if (slash <= 0) return undefined;
  const provider = ref.slice(0, slash);
  const id = ref.slice(slash + 1);
  const runtime = await getRuntime();
  return runtime.getModel(provider, id);
}

export function modelRef(model: { provider: string; id: string }): string {
  return `${model.provider}/${model.id}`;
}
