<script setup lang="ts">
import { computed, ref } from "vue";
import { state, send, abort, attachFile, removeAttachment, modelLabel } from "../store";
import EffortPicker from "./EffortPicker.vue";

const text = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

const canSend = computed(() => text.value.trim().length > 0 && !state.busy);

async function submit() {
  const value = text.value.trim();
  if (!value || state.busy) return;
  text.value = "";
  await send(value);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void submit();
  }
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    await attachFile(file);
  } finally {
    uploading.value = false;
    input.value = "";
  }
}
</script>

<template>
  <div class="px-3 pt-2 sm:px-6" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))">
    <div class="mx-auto w-full max-w-[720px]">
      <div class="relative flex w-full cursor-text flex-col rounded-2xl border border-line bg-card shadow-sm focus-within:border-line-soft">
        <div v-if="state.attachments.length" class="flex flex-wrap gap-2 px-3 pt-3">
          <span
            v-for="item in state.attachments"
            :key="item.path"
            class="inline-flex items-center gap-2 rounded-lg border border-line bg-elevated px-2.5 py-1 text-xs text-muted"
          >
            <span class="max-w-[12rem] truncate">{{ item.name }}</span>
            <button class="text-faint hover:text-danger" @click="removeAttachment(item.path)">×</button>
          </span>
        </div>

        <textarea
          v-model="text"
          data-testid="composer-input"
          rows="1"
          placeholder="Ask anything..."
          class="min-h-12 max-h-52 w-full resize-none bg-transparent px-4 pt-3.5 pb-1.5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint"
          @keydown="onKeydown"
        ></textarea>

        <div class="flex items-center gap-1 px-3 pb-2 pt-0.5">
          <input
            ref="fileInput"
            type="file"
            accept=".pdf,.docx,.txt,.md,.html,.png,.jpg,.jpeg,.webp"
            class="hidden"
            @change="onFile"
          />
          <button
            class="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink disabled:opacity-40"
            title="Attach a document"
            :disabled="uploading"
            @click="fileInput?.click()"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <div class="flex-1"></div>

          <button
            data-testid="model-chip"
            class="flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] text-muted transition hover:bg-raised hover:text-ink"
            @click="state.modelPickerOpen = true"
          >
            <span class="max-w-[9rem] truncate">{{ modelLabel(state.selectedModel) }}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>

          <button
            data-testid="effort-chip"
            class="flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] capitalize text-muted transition hover:bg-raised hover:text-ink"
            @click="state.effortOpen = !state.effortOpen"
          >
            {{ state.thinkingLevel }}
          </button>

          <button
            v-if="state.busy"
            data-testid="stop-button"
            class="grid h-8 w-8 place-items-center rounded-full bg-raised text-ink transition hover:bg-line"
            title="Stop"
            @click="abort"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
          </button>
          <button
            v-else
            data-testid="send-button"
            class="grid h-8 w-8 place-items-center rounded-full bg-accent text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
            title="Send"
            :disabled="!canSend"
            @click="submit"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>

        <EffortPicker v-if="state.effortOpen" />
      </div>
      <p class="mt-2 px-1 text-center text-[12px] text-faint">Answers can be wrong. Check important facts.</p>
    </div>
  </div>
</template>
