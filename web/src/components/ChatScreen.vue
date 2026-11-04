<script setup lang="ts">
import { computed, ref } from "vue";
import { state, clearError } from "../store";
import SessionSidebar from "./SessionSidebar.vue";
import MessageList from "./MessageList.vue";
import Composer from "./Composer.vue";
import ModelPicker from "./ModelPicker.vue";
import SettingsScreen from "./SettingsScreen.vue";

const sidebarOpen = ref(false);
const activeTitle = computed(
  () => state.sessions.find((s) => s.id === state.activeSessionId)?.title ?? "New chat",
);
</script>

<template>
  <div class="flex h-full bg-base">
    <div v-if="sidebarOpen" class="fixed inset-0 z-30 bg-black/60 sm:hidden" @click="sidebarOpen = false"></div>

    <aside
      class="fixed z-40 h-full w-[280px] shrink-0 border-r border-line bg-surface transition-transform duration-200 sm:static sm:translate-x-0"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <SessionSidebar />
    </aside>

    <main class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-12 shrink-0 items-center gap-2 border-b border-line-soft px-3">
        <button
          class="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-ink sm:hidden"
          title="Chats"
          @click="sidebarOpen = true"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <span class="truncate text-[13.5px] text-muted">{{ activeTitle }}</span>
        <div class="flex-1"></div>
        <button
          data-testid="open-settings"
          class="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-ink"
          title="Providers & settings"
          @click="state.settingsOpen = true"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 11a2 2 0 1 1 0 4z" />
          </svg>
        </button>
      </header>

      <div
        v-if="state.error"
        data-testid="error-banner"
        class="flex shrink-0 items-center gap-2 border-b border-red-900/40 bg-red-950/40 px-4 py-2 text-[13px] text-red-200"
      >
        <span class="flex-1">{{ state.error }}</span>
        <button class="text-red-300 hover:text-red-100" @click="clearError">×</button>
      </div>

      <MessageList />
      <Composer />
    </main>

    <ModelPicker v-if="state.modelPickerOpen" />
    <SettingsScreen v-if="state.settingsOpen" />
  </div>
</template>
