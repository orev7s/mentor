import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/reddit-mono";
import "./index.css";
import App from "./App";
import { installBackHandler } from "./lib/back";
import { applyHandoff, isRemoteMode } from "./lib/remote";
import { initUpdater } from "./lib/updater";

// Seed a paired connection handed over from the bundled page, then remove it from the URL.
applyHandoff();

// On Android, the app switches to the server origin once a connection succeeds
// (App does it), so a dead server shows the pairing screen instead of looping.
// Confirm the bundle loaded and check GitHub for a silent web update. Native only.
if (!isRemoteMode()) initUpdater();

// Let MainActivity route the Android back button into the open overlay first.
installBackHandler();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);