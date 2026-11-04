import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

/**
 * Packs `dist` into the zip the Android updater downloads, then optionally
 * publishes it as a GitHub release.
 *
 *   node scripts/release-web.mjs 1.0.1
 *   node scripts/release-web.mjs 1.0.1 --local     # zip only, no upload
 *   node scripts/release-web.mjs 1.0.1 --skip-build
 *
 * The release tag is `web-v<version>`, so the app can tell web bundles apart
 * from app releases. `index.html` sits at the zip root, which is what
 * @capgo/capacitor-updater expects.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const version = args.find((arg) => !arg.startsWith("--"));
const local = args.includes("--local");
const skipBuild = args.includes("--skip-build");

if (!version || !/^\d+\.\d+(\.\d+)?$/.test(version)) {
  console.error("Usage: node scripts/release-web.mjs <version> [--local] [--skip-build]");
  console.error("Example: node scripts/release-web.mjs 1.0.1");
  process.exit(1);
}

const dist = join(root, "dist");
const releases = join(root, "releases");
const zipPath = join(releases, `mentor-web-${version}.zip`);
const tag = `web-v${version}`;

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
  console.log(`\nTag ${tag} and upload that zip to a GitHub release to ship it.`);
  process.exit(0);
}

console.log(`Publishing ${tag}...`);
try {
  execFileSync(
    "gh",
    [
      "release",
      "create",
      tag,
      zipPath,
      "--title",
      `Web ${version}`,
      "--notes",
      `Silent web update ${version}. The app applies it on the next launch.`,
    ],
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