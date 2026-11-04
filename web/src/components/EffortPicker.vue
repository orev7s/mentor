<script setup lang="ts">
import { state, setThinkingLevel } from "../store";

const levels = [
  { id: "off", label: "Off", hint: "no reasoning" },
  { id: "low", label: "Low", hint: "quick" },
  { id: "medium", label: "Medium", hint: "balanced" },
  { id: "high", label: "High", hint: "deeper" },
];
</script>

<template>
  <div class="absolute bottom-[3.4rem] left-2 z-30 w-60 overflow-hidden rounded-xl border border-line bg-elevated shadow-[0_16px_40px_rgba(0,0,0,0.5)] sheet-up">
    <div class="border-b border-line-soft px-3 py-2 text-[10.5px] uppercase tracking-[0.08em] text-faint">Reasoning effort</div>
    <button
      v-for="level in levels"
      :key="level.id"
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-raised"
      @click="setThinkingLevel(level.id)"
    >
      <span class="flex-1">{{ level.label }}</span>
      <span class="text-[11px] text-faint">{{ level.hint }}</span>
      <svg v-if="state.thinkingLevel === level.id" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="text-accent">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </button>
  </div>
</template>
