# ZachsBlockCoding

<img src="assets/logo.svg" width="96" alt="ZachsBlockCoding block-Z logo">

A standalone visual helper for real JavaScript. Code is the source of truth;
blocks visualize and edit it without adding marker comments to your files.
This is an early Windows x64 prototype, not a complete IDE.

## Download and run

Get the Windows ZIP from [GitHub Releases](https://github.com/CMGCoderTobias/ZachsBlockCoding/releases).
Extract the entire folder into a writable location and run **ZachsBlockCoding.exe**.
Keep its supporting files alongside it. No npm or Node installation is needed.
Windows may warn because the executable is not Authenticode-signed.

The Reborn web setup is also provided, but its live download/update route still
needs the owner's Watchdog deployment. Use the ZIP until that deployment is
verified. Reborn signs and verifies update manifests; this is separate from
Windows executable signing.

## Connect VS Code

The connector VSIX is attached to each release and bundled in the desktop app.
Click **Get VS Code extension**, then in VS Code choose **Extensions → … →
Install from VSIX**. Pair once using **Connect VS Code** and the corresponding
VS Code command. The standalone app switches to blocks-only; VS Code owns the
live buffer and saves. See [extension instructions](EXTENSION_INSTALL.txt).

## Current capabilities

- Nested editable blocks, common templates, structured lists and expression reference.
- Source-preserving parsing, warning blocks for incomplete code, and independent sections.
- Folder browsing, multiple open files, conflict checks and layout-only block movement.
- Encrypted remembered pairing and version-checked edits to VS Code's unsaved buffer.

The optional Run button currently runs browser JavaScript in a bounded worker,
not Node imports or arbitrary npm programs. Python follows a usable JavaScript
runtime. Package block packs and adapters for other editors remain future work.

## Data and development

Packaged settings live outside the installation in a sibling `.data` directory,
on the same drive. `ZBC_DATA_DIR` explicitly overrides that location. Development
uses `.zbc-runtime`. No existing data is silently moved.

For development: `npm ci`, then `npm run electron:dev`. Tests: `npm test`,
`npm run build`, then `npm run test:ui`. Node 22.23.2 is used for this build.

For releases, copy `release-config.example.json` to
`../config/zachsblockcoding-release.windows.json` and configure the local signing
authority. `npm run release:local` builds and signs locally;
`npm run release:publish` explicitly publishes through RebornPublisher.
See [FIRST_RELEASE.txt](FIRST_RELEASE.txt) for the full workflow and limitations.

GitHub is the default release host. The configured client route and shared-agent
bootstrap use kosradio; custom hosting is opt-in, never a global hardcoded route.
The editor source is ISC licensed. See [third-party notices](THIRD_PARTY_NOTICES.md).
