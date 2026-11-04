<script setup lang="ts">
import { computed, ref } from "vue";
import { state, setSelectedModel, modelRef } from "../store";
import type { ModelSummary } from "../types";

const search = ref("");
const showAll = ref(false);

const groups = computed(() => {
  const q = search.value.toLowerCase().trim();
  const source = showAll.value
    ? state.models
    : state.models.filter((m) => state.configuredProviders.includes(m.provider));
  const filtered = source.filter(
    (m) =>
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q),
  );
  const map = new Map<string, ModelSummary[]>();
  for (const model of filtered.slice(0, 500)) {
    const list = map.get(model.provider) ?? [];
    list.push(model);
    map.set(model.provider, list);
  }
  // configured providers first
  return [...map.entries()].sort((a, b) => {
    const ca = state.configuredProviders.includes(a[0]) ? 0 : 1;
    const cb = state.configuredProviders.includes(b[0]) ? 0 : 1;
    return ca - cb || a[0].localeCompare(b[0]);
  });
});

function choose(model: ModelSummary) {
  setSelectedModel(modelRef(model));
  state.modelPickerOpen = false;
}

function providerLabel(id: string): string {
  return state.presets.find((p) => p.id === id)?.name ?? id.replace(/-/g, " ");
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
    @click.self="state.modelPickerOpen = false"
  >
    <div class="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-elevated sheet-up sm:h-auto sm:max-h-[80vh] sm:max-w-xl sm:rounded-2xl">
      <div class="flex items-center gap-2 border-b border-line-soft px-3 py-3">
        <div class="flex flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-faint">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            v-model="search"
            data-testid="model-search"
            placeholder="Search models"
            class="w-full bg-transparent py-2 text-sm outline-none placeholder:text-faint"
          />
        </div>
        <button class="px-2 text-sm text-muted hover:text-ink" data-testid="close-model-picker" @click="state.modelPickerOpen = false">
          Cancel
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-2 py-2">
        <div v-for="[provider, models] in groups" :key="provider" class="mb-2">
          <div class="flex items-center gap-2 px-3 py-1.5">
            <span class="text-[10.5px] uppercase tracking-[0.08em] text-faint">{{ providerLabel(provider) }}</span>
            <span v-if="state.configuredProviders.includes(provider)" class="rounded-full border border-line px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-success">ready</span>
          </div>
          <button
            v-for="m in models"
            :key="modelRef(m)"
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-raised"
            @click="choose(m)"
          >
            <span class="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface text-[11px] uppercase text-muted">
              {{ m.name.slice(0, 2) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13.5px] text-ink">{{ m.name }}</span>
              <span class="block truncate font-mono text-[11px] text-faint">{{ m.id }}</span>
            </span>
            <span class="flex shrink-0 items-center gap-2 text-[10.5px] text-faint">
              <span v-if="m.input.includes('image')" class="rounded border border-line px-1.5 py-0.5">vision</span>
              <span>{{ m.contextWindow ? (m.contextWindow / 1000).toFixed(0) + "k" : "" }}</span>
            </span>
          </button>
        </div>
        <p v-if="!groups.length" class="px-3 py-6 text-center text-sm text-faint">
          {{ showAll ? "No models match." : "No models yet. Add a provider key in settings." }}
        </p>
      </div>

      <button
        class="flex shrink-0 items-center justify-center gap-2 border-t border-line-soft px-4 py-3 text-[12.5px] text-muted transition hover:text-ink"
        @click="showAll = !showAll"
      >
        {{ showAll ? "Show only ready providers" : `Show all ${state.models.length} models` }}
      </button>
    </div>
  </div>
</template>
