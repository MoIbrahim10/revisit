import { spawn } from "node:child_process";
import { resolve } from "node:path";

const runner = resolve("node_modules/tsx/dist/cli.mjs");
const setup = spawn(process.execPath, [runner, "scripts/setup.ts"], { stdio: "inherit" });
const code = await new Promise<number | null>((done) => setup.on("exit", done));
if (code !== 0) process.exit(code ?? 1);
const worker = spawn(process.execPath, [runner, "scripts/worker.ts"], { stdio: "inherit" });
const web = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1"], { stdio: "inherit" });
let stopping = false;
function stop() { if (stopping) return; stopping = true; worker.kill("SIGTERM"); web.kill("SIGTERM"); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
worker.on("exit", (exitCode) => { if (!stopping) { process.exitCode = exitCode || 1; stop(); } });
web.on("exit", (exitCode) => { if (!stopping) { process.exitCode = exitCode || 1; stop(); } });
