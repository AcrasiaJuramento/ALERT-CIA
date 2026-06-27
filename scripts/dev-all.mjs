import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], {
    cwd: root,
    stdio: "inherit",
  }),
  spawn(npm, ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: path.join(root, "alert-cia-scraper"),
    stdio: "inherit",
  }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => {
    if (!child.killed) child.kill("SIGTERM");
  });
  setTimeout(() => process.exit(exitCode), 250);
}

children.forEach((child) => {
  child.on("error", (error) => {
    console.error("Unable to start ALERT-CIA development service:", error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
});

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
