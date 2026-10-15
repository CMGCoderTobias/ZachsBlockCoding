const path = require("node:path");
const os = require("node:os");

function installationRoot(executable) {
  const directory = path.dirname(path.resolve(executable));
  const parts = directory.split(path.sep);
  const marker = parts.lastIndexOf(".reborn");
  if (marker > 0 && parts[marker + 1] === "versions") return parts.slice(0, marker).join(path.sep);
  return directory;
}

function runtimeDirectory({ packaged, executable, projectRoot, override, username = os.userInfo().username }) {
  if (override) return path.resolve(override);
  if (!packaged) return path.join(projectRoot, ".zbc-runtime");
  const install = installationRoot(executable);
  const user = username.replace(/[^a-zA-Z0-9._-]/g, "_") || "user";
  return path.join(path.dirname(install), path.basename(install) + ".data", user);
}

module.exports = { installationRoot, runtimeDirectory };
