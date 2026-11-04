<script setup lang="ts">
import { reactive, ref } from "vue";
import { state, setApiKey, removeApiKey, saveProvider, deleteProvider, disconnect } from "../store";
import type { CustomProvider } from "../types";

const keys = reactive<Record<string, string>>({});
const status = ref("");
const showCustom = ref(false);
const custom = reactive({
  id: "",
  name: "",
  baseUrl: "https://ai-gateway.kilo.ai/api/v1",
  api: "openai-completions",
  apiKey: "",
  modelsText: "kilo-auto/free|Auto Free|128000|8192",
});

function isConfigured(id: string): boolean {
  return state.configuredProviders.includes(id);
}

async function saveKey(id: string) {
  const key = (keys[id] ?? "").trim();
  if (!key) return;
  status.value = "Saving...";
  await setApiKey(id, key);
  keys[id] = "";
  status.value = "Key saved.";
}

async function removeKey(id: string) {
  await removeApiKey(id);
  status.value = "Key removed.";
}

async function addCustom() {
  if (!custom.id.trim()) {
    status.value = "Provider id is required.";
    return;
  }
  const models = custom.modelsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, name, ctx, max] = line.split("|").map((part) => part?.trim());
      return {
        id: id ?? "",
        name: name || id || "",
        input: ["text"],
        contextWindow: ctx ? Number(ctx) : 128000,
        maxTokens: max ? Number(max) : 8192,
      };
    })
    .filter((m) => m.id);
  const provider: CustomProvider = {
    id: custom.id.trim(),
    name: custom.name.trim() || custom.id.trim(),
    baseUrl: custom.baseUrl.trim(),
    api: custom.api.trim() || "openai-completions",
    apiKey: custom.apiKey.trim() || undefined,
    models,
  };
  status.value = "Saving provider...";
  await saveProvider(provider);
  custom.id = "";
  custom.name = "";
  custom.apiKey = "";
  status.value = "Provider saved.";
}

async function removeCustom(id: string) {
  await deleteProvider(id);
  status.value = "Provider removed.";
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6" @click.self="state.settingsOpen = false">
    <div class="flex h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-elevated sheet-up sm:h-auto sm:max-h-[86vh] sm:max-w-2xl sm:rounded-2xl">
      <div class="flex items-center justify-between border-b border-line-soft px-5 py-4">
        <h2 class="text-[15px] font-semibold text-ink">Providers & settings</h2>
        <button class="text-sm text-muted hover:text-ink" data-testid="close-settings" @click="state.settingsOpen = false">Done</button>
      </div>

      <div class="flex-1 space-y-8 overflow-y-auto p-5">
        <p v-if="status" class="rounded-lg border border-line-soft bg-surface px-3 py-2 text-[13px] text-muted">{{ status }}</p>

        <section>
          <h3 class="mb-3 text-[11px] uppercase tracking-[0.08em] text-faint">Providers</h3>
          <div class="space-y-2.5">
            <div v-for="preset in state.presets" :key="preset.id" class="rounded-xl border border-line bg-surface p-3.5">
              <div class="flex items-center gap-2">
                <span class="text-[14px] font-medium text-ink">{{ preset.name }}</span>
                <span v-if="preset.free" class="rounded-full border border-line px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-success">free</span>
                <div class="flex-1"></div>
                <span v-if="isConfigured(preset.id)" class="text-[11px] text-success">configured</span>
              </div>
              <p class="mt-2 text-[12.5px] text-faint">{{ preset.blurb }}</p>
              <div class="mt-2.5 flex gap-2">
                <input
                  v-model="keys[preset.id]"
                  type="password"
                  :placeholder="isConfigured(preset.id) ? 'Replace key' : 'Paste API key'"
                  class="min-w-0 flex-1 rounded-lg border border-line bg-elevated px-3 py-2 text-[13px] outline-none placeholder:text-faint focus:border-line-soft"
                />
                <button class="rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white transition hover:brightness-110" @click="saveKey(preset.id)">Save</button>
                <button
                  v-if="isConfigured(preset.id)"
                  class="rounded-lg border border-line px-3 py-2 text-[13px] text-muted transition hover:text-ink"
                  @click="removeKey(preset.id)"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </section>

        <section v-if="state.customProviders.length">
          <h3 class="mb-3 text-[11px] uppercase tracking-[0.08em] text-faint">Custom providers</h3>
          <div class="space-y-2">
            <div v-for="provider in state.customProviders" :key="provider.id" class="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <div class="min-w-0 flex-1">
                <div class="text-[13.5px] text-ink">{{ provider.name }}</div>
                <div class="truncate font-mono text-[11px] text-faint">{{ provider.baseUrl }}</div>
              </div>
              <button class="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted transition hover:text-danger" @click="removeCustom(provider.id)">
                Remove
              </button>
            </div>
          </div>
        </section>

        <section>
          <button
            class="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-3 text-left transition hover:bg-raised"
            @click="showCustom = !showCustom"
          >
            <span class="text-[13.5px] text-ink">Add custom OpenAI-compatible provider</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-faint transition" :class="{ 'rotate-180': showCustom }">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          <div v-if="showCustom" class="mt-2.5 space-y-2 rounded-xl border border-line bg-surface p-3.5">
            <input v-model="custom.id" placeholder="Provider id (e.g. kilo)" class="w-full rounded-lg border border-line bg-elevated px-3 py-2 text-[13px] outline-none placeholder:text-faint" />
            <input v-model="custom.name" placeholder="Display name" class="w-full rounded-lg border border-line bg-elevated px-3 py-2 text-[13px] outline-none placeholder:text-faint" />
            <input v-model="custom.baseUrl" placeholder="Base URL" class="w-full rounded-lg border border-line bg-elevated px-3 py-2 text-[13px] outline-none placeholder:text-faint" />
            <div class="flex gap-2">
              <input v-model="custom.api" placeholder="API" class="w-1/2 rounded-lg border border-line bg-elevated px-3 py-2 text-[13px] outline-none placeholder:text-faint" />
              <input v-model="custom.apiKey" type="password" placeholder="API key (optional)" class="w-1/2 rounded-lg border border-line bg-elevated px-3 py-2 text-[13px] outline-none placeholder:text-faint" />
            </div>
            <textarea
              v-model="custom.modelsText"
              rows="3"
              placeholder="One model per line: id|name|contextWindow|maxTokens"
              class="w-full rounded-lg border border-line bg-elevated px-3 py-2 font-mono text-[12px] outline-none placeholder:text-faint"
            ></textarea>
            <button class="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110" @click="addCustom">
              Add provider
            </button>
          </div>
        </section>

        <section class="border-t border-line-soft pt-5">
          <button class="text-[13px] text-danger hover:brightness-110" @click="disconnect">Disconnect server</button>
        </section>
      </div>
    </div>
  </div>
</template>
