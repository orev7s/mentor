import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

/**
 * Silent web updates for the Android APK.
 *
 * The APK bundles the current `dist`, so a fresh install works offline. When a
 * new web bundle is published as a GitHub release, the app downloads it in the
 * background and swaps it in on the next launch. No dialog, no splash, nothing
 * the student has to tap.
 *
 * Publish flow (see docs/UPDATES.md):
 *   1. npm run release:web 1.0.1
 *   2. it tags web-v1.0.1 and attaches the web zip, plus mentor.apk if present
 *
 * The tag carries the version. The asset is the built `dist` folder zipped with
 * `index.html` at the root.
 */

const DEFAULT_REPO = "orev7s/mentor";
const REPO = (import.meta.env.VITE_UPDATE_REPO ?? DEFAULT_REPO).trim();
const PENDING_KEY = "mentor.ota.pending";
const CHECK_DELAY_MS = 4000;

interface GithubAsset {
  name: string;
  browser_download_url: string;
  /** Present on newer GitHub releases: `sha256:<hex>`. */
  digest?: string | null;
}

interface GithubRelease {
  tag_name: string;
  name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubAsset[];
}

interface Candidate {
  version: string;
  url: string;
  checksum?: string;
}

function versionParts(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map((part) => Number(part));
}

/** True when `candidate` is a later version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = versionParts(candidate);
  const now = versionParts(current);
  for (let i = 0; i < Math.max(next.length, now.length); i += 1) {
    const a = next[i] ?? 0;
    const b = now[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

function releaseVersion(tag: string): string | null {
  const match = tag.match(/(\d+\.\d+(?:\.\d+)?)/);
  return match?.[1] ?? null;
}

function webAsset(release: GithubRelease): GithubAsset | null {
  const assets = release.assets ?? [];
  const zips = assets.filter((asset) => asset.name.toLowerCase().endsWith(".zip"));
  return (
    zips.find((asset) => /mentor-web|dist|web/i.test(asset.name)) ?? zips[0] ?? null
  );
}

/** Newest release that has a web bundle zip. */
function pickRelease(releases: GithubRelease[]): Candidate | null {
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const version = releaseVersion(release.tag_name);
    const asset = webAsset(release);
    if (!version || !asset) continue;
    const digest = asset.digest?.startsWith("sha256:") ? asset.digest.slice(7) : undefined;
    return { version, url: asset.browser_download_url, checksum: digest };
  }
  return null;
}

/** GitHub only includes a digest on newer assets. Fall back to hashing the zip ourselves. */
async function sha256Of(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

async function fetchReleases(): Promise<GithubRelease[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) return [];
  return (await res.json()) as GithubRelease[];
}

async function runningVersion(): Promise<string> {
  try {
    const current = await CapacitorUpdater.current();
    return current.bundle.version || current.native || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** The bundle the app is running right now, for the settings screen. */
export async function runningBundleVersion(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const current = await CapacitorUpdater.current();
    const version = current.bundle.version || current.native;
    const kind = current.bundle.id === "builtin" ? "bundled" : "web";
    return version ? `${version} (${kind})` : null;
  } catch {
    return null;
  }
}

async function checkForUpdate(): Promise<void> {
  if (!REPO) return;
  const [releases, running] = await Promise.all([fetchReleases(), runningVersion()]);
  const candidate = pickRelease(releases);
  if (!candidate || !isNewerVersion(candidate.version, running)) {
    if (localStorage.getItem(PENDING_KEY) === candidate?.version) {
      localStorage.removeItem(PENDING_KEY);
    }
    return;
  }

  // Already staged and waiting for the next launch. Do not download it again.
  if (localStorage.getItem(PENDING_KEY) === candidate.version) return;

  // This plugin refuses a download without a checksum.
  const checksum = candidate.checksum ?? (await sha256Of(candidate.url));
  if (!checksum) return;

  const bundle = await CapacitorUpdater.download({
    url: candidate.url,
    version: candidate.version,
    checksum,
  });
  await CapacitorUpdater.next({ id: bundle.id });
  localStorage.setItem(PENDING_KEY, candidate.version);
}

/**
 * Call once from the entry point, before React renders. On the web it does
 * nothing. On Android it confirms the bundle loaded and then, a few seconds
 * later, quietly checks GitHub.
 */
export function initUpdater(): void {
  if (!Capacitor.isNativePlatform()) return;

  void CapacitorUpdater.notifyAppReady().catch(() => {
    // The native side is not there (for example a browser preview); nothing to do.
  });

  window.setTimeout(() => {
    void checkForUpdate().catch(() => {
      // Offline, rate limited, or the repo is not published yet. Try again next launch.
    });
  }, CHECK_DELAY_MS);
}

export type UpdateCheckStatus = "updated" | "latest" | "unavailable" | "failed";

export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  /** A short line for the UI. */
  message: string;
}

/**
 * The button in the overflow menu. Unlike the launch check, this stages the
 * update and then reloads straight away, so the student does not have to
 * background the app twice.
 */
export async function checkForUpdateNow(): Promise<UpdateCheckResult> {
  if (!Capacitor.isNativePlatform()) {
    return { status: "unavailable", message: "Updates install in the app." };
  }

  try {
    const [releases, running] = await Promise.all([fetchReleases(), runningVersion()]);
    const candidate = pickRelease(releases);
    if (!candidate || !isNewerVersion(candidate.version, running)) {
      return { status: "latest", message: "You are on the latest version." };
    }

    if (localStorage.getItem(PENDING_KEY) !== candidate.version) {
      const checksum = candidate.checksum ?? (await sha256Of(candidate.url));
      if (!checksum) return { status: "failed", message: "Could not verify the update." };
      const bundle = await CapacitorUpdater.download({
        url: candidate.url,
        version: candidate.version,
        checksum,
      });
      await CapacitorUpdater.next({ id: bundle.id });
      localStorage.setItem(PENDING_KEY, candidate.version);
    }

    // Reload applies the staged bundle now. It never resolves, so do not await it.
    void CapacitorUpdater.reload().catch(() => {});
    return { status: "updated", message: `Version ${candidate.version} is ready. Reloading...` };
  } catch {
    return { status: "failed", message: "Could not check for updates. Try again later." };
  }
}