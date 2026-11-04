<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { renderMarkdown } from "../markdown";

const props = defineProps<{ text: string; streaming?: boolean }>();
const html = computed(() => renderMarkdown(props.text));
const root = ref<HTMLElement | null>(null);

function enhance() {
  const el = root.value;
  if (!el) return;
  el.querySelectorAll("a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  el.querySelectorAll<HTMLElement>(".code-copy").forEach((button) => {
    button.onclick = async () => {
      const raw = decodeURIComponent(button.dataset.copy ?? "");
      try {
        await navigator.clipboard.writeText(raw);
        const original = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = original ?? "Copy";
        }, 1200);
      } catch {
        // clipboard unavailable
      }
    };
  });
}

watch(html, () => requestAnimationFrame(enhance), { flush: "post" });
onMounted(enhance);
</script>

<template>
  <div ref="root" class="mentor-markdown" :class="{ 'stream-cursor': streaming }" v-html="html"></div>
</template>