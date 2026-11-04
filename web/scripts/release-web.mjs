import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

/**
 * Packs `dist` into the zip the Android updater downloads, then optionally
 * publishes it as a GitHub release. If `mentor.apk` sits at the repo root, it
 * is attached to the same release, because native changes ship that way too.
 *
 *   node scripts/release-web.mjs 1.0.1
 *   node scripts/release-web.mjs 1.0.1 --local     # zip only, no upload
 *   node scripts/release-web.mjs 1.0.1 --skip-build
 *   node scripts/release-web.mjs 1.0.9 --allow-apk-mismatch
 *
 * `--allow-apk-mismatch` attaches the mentor.apk that is already at the repo
 * root even when its versionName is older than the web release. Use it when a
 * web-only change should ship next to the current APK without rebuilding native.
 *
 * The release tag is `web-v<version>`, so the app can tell web bundles apart
 * from app releases. `index.html` sits at the zip root, which is what
 * @capgo/capacitor-updater expects.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(root, "..");
const args = process.argv.slice(2);
const version = args.find((arg) => !arg.startsWith("--"));
const local = args.includes("--local");
const skipBuild = args.includes("--skip-build");
const allowApkMismatch = args.includes("--allow-apk-mismatch");

if (!version || !/^\d+\.\d+(\.\d+)?$/.test(version)) {
  console.error(
    "Usage: node scripts/release-web.mjs <version> [--local] [--skip-build] [--allow-apk-mismatch]",
  );
  console.error("Example: node scripts/release-web.mjs 1.0.1");
  process.exit(1);
}

const dist = join(root, "dist");
const releases = join(root, "releases");
const zipPath = join(releases, `mentor-web-${version}.zip`);
const apkPath = join(repoRoot, "mentor.apk");
const tag = `web-v${version}`;

// The APK and the web bundle share a version, so warn when they drift apart.
const gradle = readFileSync(join(root, "android/app/build.gradle"), "utf8");
const nativeVersion = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
const withApk = existsSync(apkPath);
const apkMismatch = withApk && Boolean(nativeVersion) && nativeVersion !== version;
if (apkMismatch && !allowApkMismatch) {
  console.error(
    `mentor.apk is versionName ${nativeVersion} but this release is ${version}. ` +
      `Bump versionName in android/app/build.gradle, rebuild, then release. ` +
      `To attach the existing APK to a web-only release anyway, pass --allow-apk-mismatch.`,
  );
  process.exit(1);
}
if (apkMismatch && allowApkMismatch) {
  console.warn(
    `Attaching the existing mentor.apk (versionName ${nativeVersion}) to the ${version} web release. ` +
      `Installed apps still get the web bundle over the air; a fresh APK install starts on ${nativeVersion} and updates itself.`,
  );
}
if (!withApk && nativeVersion && nativeVersion !== version) {
  console.log(
    `No mentor.apk at ${apkPath}, so this is a web-only release. ` +
      `Native is versionName ${nativeVersion}.`,
  );
}


if (!skipBuild) {
  console.log("Building the web bundle...");
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
}

if (!existsSync(join(dist, "index.html"))) {
  console.error("dist/index.html is missing. Build first.");
  process.exit(1);
}

mkdirSync(releases, { recursive: true });
rmSync(zipPath, { force: true });

console.log("Packing dist...");
// Run inside dist so the archive has index.html at the root, not a parent folder.
execFileSync("zip", ["-r", "-X", "-q", zipPath, "."], { cwd: dist });

const size = readFileSync(zipPath).byteLength;
console.log(`Wrote ${zipPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);

if (local) {
  const assets = withApk ? `that zip and mentor.apk` : `that zip`;
  console.log(`\nTag ${tag} and upload ${assets} to a GitHub release to ship it.`);
  process.exit(0);
}

const assetPaths = withApk ? [zipPath, apkPath] : [zipPath];
const title = withApk ? `Mentor ${version}` : `Web ${version}`;
const notes = withApk
  ? apkMismatch
    ? `Web update ${version} with the current Android app (versionName ${nativeVersion}).

- mentor.apk: the Android app. There is no native change in this release, so it stays on ${nativeVersion}. It stages the web bundle on launch and applies it on the next open.
- mentor-web-${version}.zip: the web bundle existing installs download silently.`
    : `Native app release (versionName ${version}) with the matching web bundle.

- mentor.apk: the Android app. Side-load it.
- mentor-web-${version}.zip: the web bundle the app downloads on launch for silent updates.

Install mentor.apk once. It stages this web bundle on launch and applies it on the next open.`
  : `Silent web update ${version}. The app applies it on the next launch.`;

console.log(`Publishing ${tag}...`);
try {
  execFileSync(
    "gh",
    ["release", "create", tag, ...assetPaths, "--title", title, "--notes", notes],
    { cwd: root, stdio: "inherit" },
  );
} catch {
  console.error(
    `\ngh could not publish. The zip is ready at ${zipPath}. ` +
      `Create a release tagged ${tag} and attach it by hand.`,
  );
  process.exit(1);
}
console.log(`\nPublished ${tag}. Installed apps pick it up on their next launch.`);