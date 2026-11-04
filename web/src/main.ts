import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { loadSavedConnection } from "./store";

loadSavedConnection();
createApp(App).mount("#app");
