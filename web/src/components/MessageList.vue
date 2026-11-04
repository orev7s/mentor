<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { state, send } from "../store";
import Markdown from "./Markdown.vue";
import type { ChatMessage, ContentBlock } from "../types";

const scroller = ref<HTMLElement | null>(null);

const items = computed<ChatMessage[]>(() => {
  const list = [...state.messages];
  if (state.streamText) {
    list.push({ role: "assistant", content: [{ type: "text", text: state.streamText }] });
  }
  return list;
});

const hasContent = computed(() => items.value.length > 0);

const suggestions = [
  "Explain photosynthesis like I'm in 8th grade.",
  "Make a 5-question quiz from my notes.",
  "Summarize this PDF and list key terms.",
  "Walk me through solving a quadratic equation.",
];

function textOf(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}
function thinkingOf(message: ChatMessage): string {
  if (typeof message.content === "string") return "";
  return message.content
    .filter((b) => b.type === "thinking")
    .map((b) => b.thinking ?? "")
    .join("");
}
function toolsOf(message: ChatMessage): ContentBlock[] {
  if (typeof message.content === "string") return [];
  return message.content.filter((b) => b.type === "toolCall");
}
function argPreview(tool: ContentBlock): string {
  try {
    const raw = JSON.stringify(tool.arguments ?? {});
    return raw.length > 80 ? raw.slice(0, 80) + "..." : raw;
  } catch {
    return "";
  }
}

watch(
  () => [items.value.length, state.streamText],
  async () => {
    await nextTick();
    const el = scroller.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
  { flush: "post" },
);

function start(text: string) {
  void send(text);
}
</script>

<template>
  <div ref="scroller" class="relative flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl px-4 py-6">
      <div v-if="!hasContent" class="flex h-full min-h-[50vh] flex-col items-center justify-center text-center">
        <div class="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-accent to-[#3b2f8f] text-lg font-semibold text-white">M</div>
        <h2 class="text-lg font-medium text-ink">What are we studying?</h2>
        <p class="mt-1 max-w-sm text-sm text-faint">
          Ask anything, or attach your notes and PDFs and I'll work from them.
        </p>
        <div class="mt-6 grid w-full max-w-md gap-2">
          <button
            v-for="s in suggestions"
            :key="s"
            class="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-[13px] text-muted transition hover:border-line-soft hover:bg-elevated hover:text-ink"
            @click="start(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <div v-else class="space-y-8">
        <template v-for="(m, i) in items" :key="i">
          <div v-if="m.role === 'user'" class="flex justify-end rise">
            <div class="max-w-[86%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-line bg-raised px-4 py-2.5 text-[15px] leading-relaxed text-ink">
              {{ textOf(m) }}
            </div>
          </div>

          <div v-else-if="m.role === 'assistant'" class="flex gap-3 rise">
            <div class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#3b2f8f] text-[11px] font-semibold text-white">M</div>
            <div class="min-w-0 flex-1 space-y-2.5">
              <details
                v-if="thinkingOf(m)"
                class="group rounded-xl border border-line-soft bg-surface px-3 py-2"
              >
                <summary class="cursor-pointer select-none text-xs text-muted marker:text-faint">Reasoning</summary>
                <div class="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-faint">{{ thinkingOf(m) }}</div>
              </details>

              <div
                v-for="(tool, ti) in toolsOf(m)"
                :key="ti"
                class="flex items-center gap-2 rounded-xl border border-line-soft bg-surface px-3 py-2 text-[13px]"
              >
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
                <span class="shrink-0 font-medium text-ink">{{ tool.name }}</span>
                <span class="truncate font-mono text-[11px] text-faint">{{ argPreview(tool) }}</span>
              </div>

              <Markdown
                v-if="textOf(m)"
                :text="textOf(m)"
                :streaming="!!state.streamText && i === items.length - 1"
              />
            </div>
          </div>

          <div v-else-if="m.role === 'toolResult'" class="flex gap-3">
            <div class="mt-0.5 h-6 w-6 shrink-0"></div>
            <div class="flex items-center gap-2 text-[12px] text-faint">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" /></svg>
              <span :class="m.isError ? 'text-danger' : 'text-faint'">{{ m.toolName }}</span>
            </div>
          </div>
        </template>

        <div v-if="state.busy && !state.streamText" class="flex items-center gap-2 pl-9 text-[13px] text-faint">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
          Thinking...
        </div>
      </div>
    </div>
  </div>
</template>
