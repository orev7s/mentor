<script setup lang="ts">
import { state } from "./store";
import ConnectScreen from "./components/ConnectScreen.vue";
import ChatScreen from "./components/ChatScreen.vue";
</script>

<template>
  <ConnectScreen v-if="!state.connected" />
  <ChatScreen v-else />
</template>
