import { useEffect, useRef } from "react";

/**
 * Android back button bridge.
 *
 * The app runs in a WebView with no browser history for overlays, so the system
 * back button used to close the whole app. MainActivity calls
 * `window.__mentorHandleBack()`; anything currently open registers a handler and
 * the top one (last opened) gets the first chance to close itself. When nothing
 * claims the back press, the native side falls back to history or the launcher.
 */

type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.indexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/**
 * Register a handler while `active` is true. The callback lives in a ref so a
 * re-render of an ancestor does not re-register (and re-order) the handler:
 * mount order decides which overlay is on top, not render order.
 */
export function useBackHandler(active: boolean, onBack: () => void): void {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => {
      latest.current();
      return true;
    });
  }, [active]);
}

/** Called from MainActivity through `evaluateJavascript`. True when the UI closed something. */
export function handleBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    const handler = handlers[i];
    if (!handler) continue;
    try {
      if (handler()) return true;
    } catch {
      // a broken overlay must not block the back press
    }
  }
  return false;
}

/** Expose the bridge on `window`. Call once from the entry point. */
export function installBackHandler(): void {
  (window as unknown as { __mentorHandleBack?: () => boolean }).__mentorHandleBack = handleBack;
}
