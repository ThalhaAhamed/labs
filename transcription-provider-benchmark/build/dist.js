/**
 * `npm run dist*`: electron-builder, plus one convenience.
 *
 * electron-builder reads the folder it caches downloaded Electron zips in from
 * its config (electronDownload.cache), not from the environment. If you keep
 * that cache somewhere specific (e.g. off your system drive) by setting
 * ELECTRON_CACHE, this passes it through, so the choice stays on your machine
 * and out of package.json. Its own tool cache already follows
 * ELECTRON_BUILDER_CACHE.
 */
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
if (process.env.ELECTRON_CACHE) args.push(`--config.electronDownload.cache=${process.env.ELECTRON_CACHE}`);

const result = spawnSync(process.execPath, [require.resolve("electron-builder/cli.js"), ...args], { stdio: "inherit" });
process.exit(result.status ?? 1);
