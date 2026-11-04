<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  name: string;
  state: "LOADING" | "COMPLETED" | "ERROR";
  args?: unknown;
  result?: unknown;
  durationMs?: number;
}>();

const hasArgs = computed(() => {
  const value = props.args;
  return value !== undefined && value !== null && typeof value === "object" && Object.keys(value).length > 0;
});
const argsJson = computed(() => JSON.stringify(props.args ?? {}, null, 2));
const resultText = computed(() => {
  const value = props.result as { content?: { type: string; text?: string }[] } | string | undefined;
  if (typeof value === "string") return value;
  if (value && Array.isArray(value.content)) {
    return value.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
  }
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
});
const duration = computed(() =>
  props.durationMs ? `${(props.durationMs / 1000).toFixed(1)}s` : "",
);
</script>

<template>
  <details class="group w-full overflow-hidden rounded-lg border border-line bg-surface">
    <summary
      class="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[13px] text-ink [&::-webkit-details-marker]:hidden"
    >
      <span
        v-if="state === 'LOADING'"
        class="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-muted"
      ></span>
      <svg
        v-else-if="state === 'COMPLETED'"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        class="shrink-0 text-emerald-400"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="shrink-0 text-danger">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
      <span class="truncate font-medium">{{ name }}</span>
      <span v-if="duration" class="ml-auto shrink-0 text-[11px] text-faint">{{ duration }}</span>
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="shrink-0 text-faint transition group-open:rotate-180"
        :class="{ 'ml-auto': !duration }"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </summary>

    <div class="border-t border-line-soft px-3 py-3">
      <p v-if="state === 'LOADING'" class="animate-pulse text-[12.5px] text-muted">Processing...</p>
      <template v-else>
        <template v-if="hasArgs">
          <p class="mb-1 text-[10.5px] uppercase tracking-[0.08em] text-faint">Input</p>
          <pre class="mb-3 max-h-40 overflow-auto rounded-md border border-line-soft bg-base p-2 font-mono text-[11.5px] leading-relaxed text-muted">{{ argsJson }}</pre>
        </template>
        <p class="mb-1 text-[10.5px] uppercase tracking-[0.08em] text-faint">
          {{ state === "ERROR" ? "Error" : "Output" }}
        </p>
        <pre
          class="max-h-72 overflow-auto rounded-md border border-line-soft bg-base p-2 font-mono text-[11.5px] leading-relaxed"
          :class="state === 'ERROR' ? 'text-danger' : 'text-muted'"
        >{{ resultText }}</pre>
      </template>
    </div>
  </details>
</template>
