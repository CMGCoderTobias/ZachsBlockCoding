const { execFile } = require("node:child_process");
const path = require("node:path");

function reportHealth(environment = process.env, execute = execFile) {
  const executable = environment.REBORN_UPDATE_AGENT_EXE;
  const version = environment.REBORN_APP_VERSION;
  if (environment.REBORN_APP_ID !== "zachsblockcoding" || !executable || !path.isAbsolute(executable) || !version) return Promise.resolve({ managed: false });
  return new Promise(resolve => {
    execute(executable, ["health", "--app", "zachsblockcoding", "--version", version], { windowsHide: true, timeout: 15000, maxBuffer: 65536 }, error => {
      resolve(error ? { managed: true, error: error.message } : { managed: true, healthy: true });
    });
  });
}

module.exports = { reportHealth };
