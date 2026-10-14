const { spawn } = require("child_process");
const path = require("path");
const vite = spawn(process.execPath, [path.join(__dirname, "../node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--strictPort"], { stdio: "inherit" });
let electron;
let stopped = false;
async function start() {
  for (let attempt = 0; attempt < 100 && !stopped; attempt++) {
    try {
      const result = await fetch("http://127.0.0.1:5173", { signal: AbortSignal.timeout(1000) });
      if (!result.ok || stopped) throw new Error("Server not ready");
      electron = spawn(require("electron"), ["."], { stdio: "inherit", env: { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:5173" } });
      electron.on("exit", code => { stopped = true; vite.kill(); process.exit(code || 0); });
      return;
    } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  if (!stopped) { vite.kill(); process.exit(1); }
}
vite.on("exit", () => { stopped = true; electron?.kill(); });
process.on("SIGINT", () => { stopped = true; electron?.kill(); vite.kill(); });
void start();
