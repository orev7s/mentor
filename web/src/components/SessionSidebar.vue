<script setup lang="ts">
import { state, createSession, openSession, deleteSession } from "../store";

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center gap-2 px-4 pb-2 pt-4">
      <span class="text-[15px] font-semibold tracking-tight text-ink">Mentor</span>
      <div class="flex-1"></div>
      <button
        class="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-ink"
        title="New chat"
        data-testid="new-chat"
        @click="createSession()"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>

    <div class="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
      <button
        v-for="session in state.sessions"
        :key="session.id"
        class="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition"
        :class="session.id === state.activeSessionId ? 'bg-raised' : 'hover:bg-elevated'"
        @click="openSession(session.id)"
      >
        <span
          class="flex-1 truncate text-[13.5px]"
          :class="session.id === state.activeSessionId ? 'text-ink' : 'text-muted'"
        >
          {{ session.title }}
        </span>
        <span class="text-[11px] text-faint group-hover:hidden">{{ timeAgo(session.updatedAt) }}</span>
        <span
          class="hidden text-faint hover:text-danger group-hover:block"
          title="Delete chat"
          @click.stop="deleteSession(session.id)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </svg>
        </span>
      </button>

      <p v-if="!state.sessions.length" class="px-3 py-2 text-[12px] text-faint">No chats yet.</p>
    </div>
  </div>
</template>
