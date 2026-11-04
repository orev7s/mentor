<script setup lang="ts">
import { ref } from "vue";
import { state, connect } from "../store";

const url = ref(state.url || "");
const token = ref(state.token || "");

async function submit() {
  await connect(url.value, token.value);
}
</script>

<template>
  <div class="flex h-full items-center justify-center bg-base p-6">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex flex-col items-center text-center">
        <div class="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-[#3b2f8f] text-xl font-semibold text-white">M</div>
        <h1 class="text-xl font-semibold tracking-tight text-ink">Mentor</h1>
        <p class="mt-1 text-[13px] text-faint">Connect to your agent server.</p>
      </div>

      <form class="space-y-3" @submit.prevent="submit">
        <label class="block">
          <span class="text-[11px] uppercase tracking-[0.08em] text-faint">Server address</span>
          <input
            v-model="url"
            data-testid="server-url"
            autocomplete="off"
            placeholder="http://1.2.3.4:8787"
            class="mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-faint focus:border-accent"
          />
        </label>

        <label class="block">
          <span class="text-[11px] uppercase tracking-[0.08em] text-faint">Access token</span>
          <input
            v-model="token"
            data-testid="server-token"
            type="password"
            placeholder="token printed by the server"
            class="mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-faint focus:border-accent"
          />
        </label>

        <p v-if="state.error" class="text-[13px] text-danger">{{ state.error }}</p>

        <button
          type="submit"
          data-testid="connect-button"
          :disabled="state.connecting || !url || !token"
          class="mt-1 w-full rounded-xl bg-accent py-2.5 text-[14px] font-medium text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {{ state.connecting ? "Connecting..." : "Connect" }}
        </button>
      </form>

      <p class="mt-4 text-center text-[11.5px] leading-relaxed text-faint">
        The address and token are shown when the agent server starts.
      </p>
    </div>
  </div>
</template>
