import { Capacitor } from "@capacitor/core";
import { normaliseUrl } from "@/lib/api";

/**
 * Remote mode: on Android, run the UI from the agent server instead of the
 * bundled `capacitor://localhost` copy.
 *
 * The bundled WebView page has a different origin from the server, so images,
 * the SSE stream and every fetch are cross-origin and some of it is blocked or
 * behaves differently than it does in a browser. Loading the same build from
 * `http://<server>:8790/` makes the page same-origin with the server, which is
 * exactly the environment where everything already works.
 *
 * The bundled app is still the entry point: it pairs once, then hands the
 * connection to the server origin in the URL hash (never sent to the server).
 */

const CONNECTION_KEY = "mentor.connection";
const HASH_SERVER = "mentor-server";
const HASH_TOKEN = "mentor-token";

interface StoredConnection {
  url?: string;
  token?: string;
}

function storedConnection(): StoredConnection {
  try {
    const raw = localStorage.getItem(CONNECTION_KEY);
    return raw ? (JSON.parse(raw) as StoredConnection) : {};
  } catch {
    return {};
  }
}

/** Read a handoff hash, seed this origin's connection, and clean the address bar. */
export function applyHandoff(): void {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.includes(HASH_TOKEN)) {
    const params = new URLSearchParams(hash);
    const token = params.get(HASH_TOKEN);
    const url = params.get(HASH_SERVER) || window.location.origin;
    if (token) {
      try {
        localStorage.setItem(CONNECTION_KEY, JSON.stringify({ url, token }));
      } catch {
        // storage may be unavailable; the user can pair again
      }
    }
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
}

/** True when the page is running from the server origin rather than the bundle. */
export function isRemoteMode(): boolean {
  return Capacitor.isNativePlatform() && window.location.protocol.startsWith("http");
}

/**
 * Send the WebView to the server URL when it is a different host. Returns true
 * when a navigation started, so the caller can stop rendering.
 */
export function redirectToServer(url?: string, token?: string): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  const provided = url?.trim() || storedConnection().url?.trim() || "";
  if (!provided) return false;
  let target: URL;
  try {
    target = new URL(normaliseUrl(provided));
  } catch {
    return false;
  }
  if (target.host === window.location.host) return false;

  const secret = token?.trim() || storedConnection().token?.trim() || "";
  const hash = secret
    ? `#${HASH_SERVER}=${encodeURIComponent(target.origin)}&${HASH_TOKEN}=${encodeURIComponent(secret)}`
    : "";
  window.location.replace(`${target.origin}/${hash}`);
  return true;
}
