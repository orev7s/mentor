<script setup lang="ts">
defineProps<{ text: string }>();
</script>

<template>
  <details class="group">
    <summary
      class="flex cursor-pointer select-none items-center gap-2 text-[13px] text-muted transition hover:text-ink [&::-webkit-details-marker]:hidden"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="transition group-open:rotate-90"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
      <span>Thought</span>
    </summary>
    <div class="mt-1.5 whitespace-pre-wrap border-l-2 border-line pl-3 text-[12.5px] leading-relaxed text-faint">
      {{ text }}
    </div>
  </details>
</template>
