#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(CURRENT_DIR, "..", "server", "server.js");

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "development",
  NEXTPLANNER_ENV: process.env.NEXTPLANNER_ENV ?? "dev",
  NEXTPLANNER_ADMIN_PASSWORD: process.env.NEXTPLANNER_ADMIN_PASSWORD ?? "Test123",
  NEXTPLANNER_EDITOR_PASSWORD: process.env.NEXTPLANNER_EDITOR_PASSWORD ?? "Test123",
  NEXTPLANNER_USER_PASSWORD: process.env.NEXTPLANNER_USER_PASSWORD ?? "Test123",
};

const child = spawn(process.execPath, [SERVER_ENTRY], {
  env,
  stdio: "inherit",
});

const forwardSignal = (signal) => {
  if (!signal || child.killed) return;
  child.kill(signal);
};

process.on("SIGINT", forwardSignal);
process.on("SIGTERM", forwardSignal);
process.on("SIGQUIT", forwardSignal);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
