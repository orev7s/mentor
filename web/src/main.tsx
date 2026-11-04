import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/reddit-mono";
import "./index.css";
import App from "./App";
import { initUpdater } from "./lib/updater";

// Confirm the bundle loaded and check GitHub for a silent web update. Native only.
initUpdater();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);