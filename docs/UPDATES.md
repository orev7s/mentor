# Web updates (silent OTA)

The Android app ships with a copy of `web/dist`, so it works with no network
and no server. Web changes do not need a new APK: they go out as a GitHub
release, and installed apps pick them up on their own.

## What the app does

On every launch, before React renders, `web/src/lib/updater.ts` runs:

1. `CapacitorUpdater.notifyAppReady()` so the native updater knows the bundle
   loaded. Skip this and it rolls the app back to the previous bundle.
2. Four seconds later, `GET https://api.github.com/repos/<repo>/releases`.
3. Finds the newest release that has a `.zip` asset. The version comes from the
   release tag, for example `web-v1.0.3` gives `1.0.3`.
4. If it is newer than the running bundle, downloads the zip, checks the
   SHA-256 that GitHub reports for the asset, and calls
   `CapacitorUpdater.next(...)`.
5. The new bundle goes live the next time the app is backgrounded or opened.

There is no dialog, no splash, and nothing for the student to tap. If the
download fails or the phone is offline, it just tries again next launch.

To see which bundle is live, open Settings. It shows `Running bundle 1.0.18
(web)` after an update has applied, or `1.0.18 (bundled)` while the copy that
shipped inside the APK is still in use.

The repo is `orev7s/mentor` by default. Override it at build time with
`VITE_UPDATE_REPO`, or edit `DEFAULT_REPO` in `web/src/lib/updater.ts`.

```
VITE_UPDATE_REPO=you/mentor npm run build
```

The repo must be public. A private repo needs a token, which does not belong in
a shipped APK.

## Publishing a web update

```
cd web
npm run release:web 1.0.1
```

That builds `dist`, zips it to `releases/mentor-web-1.0.1.zip` with
`index.html` at the root, and runs:

```
gh release create web-v1.0.1 releases/mentor-web-1.0.1.zip \
  --title "Web 1.0.1" --notes "Silent web update 1.0.1."
```

If `mentor.apk` exists at the repo root, the script attaches it to the same
release and titles it `Mentor 1.0.1` instead, because a native change ships both
in one place. That is the usual release: one tag, two assets, `mentor.apk` plus
`mentor-web-<version>.zip`. The script refuses to publish when the APK's
`versionName` does not match the release version, so the two never drift.

Pass `--allow-apk-mismatch` to attach the existing APK to a newer web-only
release anyway. The release notes say the APK's real `versionName`; installed
apps still get the web bundle over the air, and a fresh install starts on the
older native version and updates itself. `Mentor 1.0.9` was shipped this way
with the `1.0.8` APK.

Pass `--local` to only build and zip, then upload the files yourself. Pass
`--skip-build` when `dist` is already current. Note that npm needs a `--` to
forward those flags: `npm run release:web 1.0.1 -- --skip-build`.

Rules that matter:

- The tag must contain the version as `major.minor` or `major.minor.patch`.
  `web-v1.0.1` and `v1.0.1` both work.
- Attach a `.zip` whose name mentions `mentor-web`, `web` or `dist` so the app
  picks it over any other zip on the release.
- The running native version is `versionName` in
  `web/android/app/build.gradle` (currently `1.0.18`), so the next web release
  after that APK should be `1.0.19` or higher.
- Do not start a web version below the native version. `resetWhenUpdate` makes
  the native install win, and a lower web tag would be ignored.

## When a new APK is still required

Only when native code changes: a new Capacitor plugin, a permission, the app
icon, the download listener, the updater itself, or the microphone permission
voice input needs. In that case bump `versionCode` and `versionName`, run
`npx cap sync android` and `./gradlew assembleDebug`, copy the APK to
`mentor.apk` at the repo root, then release once. `npm run release:web
<version>` attaches both `mentor.apk` and the web bundle to the same release.
After that, web changes go back to being silent.

## Config

`web/capacitor.config.json` sets:

```json
"CapacitorUpdater": {
  "autoUpdate": "off",
  "statsUrl": "",
  "appReadyTimeout": 15000,
  "responseTimeout": 30,
  "resetWhenUpdate": true
}
```

`autoUpdate: "off"` means the plugin never talks to Capgo's servers; the app
drives every step. `statsUrl: ""` disables reporting. The plugin refuses a
download without a checksum, so the updater always sends one.
