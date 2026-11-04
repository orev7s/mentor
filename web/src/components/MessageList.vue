<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { state, send } from "../store";
import Markdown from "./Markdown.vue";
import ToolCard from "./ToolCard.vue";
import ThoughtBlock from "./ThoughtBlock.vue";
import type { ChatMessage, ContentBlock, ToolCallState } from "../types";

const scroller = ref<HTMLElement | null>(null);
const copied = ref<number | null>(null);

const items = computed<ChatMessage[]>(() => {
  const list = [...state.messages];
  if (state.streamText) {
    list.push({ role: "assistant", content: [{ type: "text", text: state.streamText }] });
  }
  return list;
});

const hasContent = computed(() => items.value.length > 0);

const suggestions = [
  "Explain photosynthesis like I'm in 8th grade",
  "Quiz me on my notes",
  "Summarize this PDF",
  "Solve a quadratic step by step",
];

function textOf(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}
function thinkingOf(message: ChatMessage): string {
  if (typeof message.content === "string") return "";
  return message.content.filter((b) => b.type === "thinking").map((b) => b.thinking ?? "").join("");
}
function toolsOf(message: ChatMessage): ContentBlock[] {
  if (typeof message.content === "string") return [];
  return message.content.filter((b) => b.type === "toolCall");
}
function toolState(tool: ContentBlock): ToolCallState {
  const live = tool.id ? state.toolCalls[tool.id] : undefined;
  return live ?? { name: tool.name ?? "tool", args: tool.arguments, state: "COMPLETED" };
}
function isStreaming(index: number): boolean {
  return !!state.streamText && index === items.value.length - 1;
}

watch(
  () => [items.value.length, state.streamText, state.activeSessionId],
  async () => {
    await nextTick();
    const el = scroller.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
  { flush: "post" },
);

async function copy(text: string, index: number) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = index;
    setTimeout(() => {
      if (copied.value === index) copied.value = null;
    }, 1200);
  } catch {
    // clipboard unavailable
  }
}

function start(text: string) {
  void send(text);
}
</script>

<template>
  <div ref="scroller" class="relative flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-[720px] px-4 sm:px-6">
      <!-- loading a session -->
      <div v-if="state.loadingSession" class="space-y-8 pt-6 pb-8">
        <div class="flex flex-col items-end">
          <div class="h-10 w-2/5 animate-pulse rounded-2xl bg-fill"></div>
        </div>
        <div class="space-y-2">
          <div class="h-3.5 w-4/5 animate-pulse rounded bg-elevated"></div>
          <div class="h-3.5 w-3/5 animate-pulse rounded bg-elevated"></div>
        </div>
      </div>

      <!-- empty -->
      <div v-else-if="!hasContent" class="flex flex-col items-center pt-[16vh] text-center">
        <h2 class="text-[26px] font-medium text-balance text-ink sm:text-[32px]">What should we work on?</h2>
        <p class="mt-2 max-w-[52ch] text-[15px] text-pretty text-faint">
          Ask about your notes, or attach a PDF and I'll work from it.
        </p>
        <div class="mt-8 flex flex-wrap justify-center gap-2">
          <button
            v-for="s in suggestions"
            :key="s"
            class="rounded-full border border-line bg-card px-3.5 py-2 text-[13px] text-muted transition hover:border-line-soft hover:text-ink"
            @click="start(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <!-- conversation -->
      <div v-else class="flex flex-col gap-8 pt-6 pb-8">
        <template v-for="(m, i) in items" :key="i">
          <!-- user: bubble -->
          <div v-if="m.role === 'user'" class="group/message flex flex-col items-end gap-2 rise">
            <div class="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-fill px-4 py-2.5 text-start text-[15px] leading-relaxed text-ink">
              {{ textOf(m) }}
            </div>
          </div>

          <!-- assistant: flat, document-style -->
          <div v-else-if="m.role === 'assistant'" class="group/message flex flex-col items-start gap-2 rise">
            <ThoughtBlock v-if="thinkingOf(m)" :text="thinkingOf(m)" class="w-full" />
            <ToolCard
              v-for="(tool, ti) in toolsOf(m)"
              :key="ti"
              :name="toolState(tool).name"
              :state="toolState(tool).state"
              :args="toolState(tool).args"
              :result="toolState(tool).result"
              :duration-ms="toolState(tool).durationMs"
            />
            <div v-if="textOf(m)" class="w-full max-w-[68ch]">
              <Markdown :text="textOf(m)" :streaming="isStreaming(i)" />
            </div>
            <button
              v-if="textOf(m) && !isStreaming(i) && !state.busy"
              class="text-[12px] text-faint opacity-0 transition hover:text-muted group-hover/message:opacity-100"
              @click="copy(textOf(m), i)"
            >
              {{ copied === i ? "Copied" : "Copy" }}
            </button>
          </div>

          <div v-else-if="m.role === 'toolResult'" class="hidden"></div>
        </template>

        <div v-if="state.busy && !state.streamText" class="flex flex-col items-start">
          <span class="shimmer-text text-[14px] font-medium">Thinking</span>
        </div>
      </div>
    </div>
  </div>
</template>
