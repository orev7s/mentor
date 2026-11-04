<script setup lang="ts">
import { computed, ref } from "vue";
import { state, send, abort, attachFile, removeAttachment, modelLabel } from "../store";
import EffortPicker from "./EffortPicker.vue";

const text = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

const canSend = computed(() => text.value.trim().length > 0 && !state.busy);

const modelReady = computed(() => {
  if (!state.selectedModel) return false;
  const provider = state.selectedModel.split("/")[0];
  return state.configuredProviders.includes(provider);
});

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
  <div class="px-3 pt-2" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))">
    <div class="mx-auto w-full max-w-3xl">
      <div class="relative rounded-2xl border border-line bg-elevated shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
        <div v-if="state.attachments.length" class="flex flex-wrap gap-2 px-3 pt-3">
          <span
            v-for="item in state.attachments"
            :key="item.path"
            class="inline-flex items-center gap-2 rounded-lg border border-line bg-raised px-2.5 py-1 text-xs text-muted"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <span class="max-w-[12rem] truncate">{{ item.name }}</span>
            <button class="text-faint hover:text-danger" @click="removeAttachment(item.path)">×</button>
          </span>
        </div>

        <textarea
          v-model="text"
          data-testid="composer-input"
          rows="1"
          placeholder="Ask a question, or drop a PDF in..."
          class="max-h-52 w-full resize-none bg-transparent px-4 pt-4 pb-1 text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint"
          @keydown="onKeydown"
        ></textarea>

        <div class="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
          <input
            ref="fileInput"
            type="file"
            accept=".pdf,.docx,.txt,.md,.html,.png,.jpg,.jpeg,.webp"
            class="hidden"
            @change="onFile"
          />
          <button
            class="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-ink disabled:opacity-40"
            title="Attach a document"
            :disabled="uploading"
            @click="fileInput?.click()"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <button
            data-testid="model-chip"
            class="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] text-muted transition hover:border-line-soft hover:bg-raised hover:text-ink"
            @click="state.modelPickerOpen = true"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="modelReady ? 'bg-success' : 'bg-faint'"></span>
            <span class="max-w-[8.5rem] truncate">{{ modelLabel(state.selectedModel) }}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>

          <button
            data-testid="effort-chip"
            class="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] text-muted transition hover:border-line-soft hover:bg-raised hover:text-ink"
            @click="state.effortOpen = !state.effortOpen"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4z" />
            </svg>
            <span class="capitalize">{{ state.thinkingLevel }}</span>
          </button>

          <div class="flex-1"></div>

          <button
            v-if="state.busy"
            data-testid="stop-button"
            class="grid h-8 w-8 place-items-center rounded-lg bg-raised text-ink transition hover:bg-line"
            title="Stop"
            @click="abort"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
          </button>
          <button
            v-else
            data-testid="send-button"
            class="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
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
      <p class="mt-2 text-center text-[11px] text-faint">Mentor can make mistakes. Check important answers.</p>
    </div>
  </div>
</template>
