import { spawn } from "node:child_process";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { Pool } from "pg";

// Deliberately ignore any application connection URL: this harness only uses its local test database.
const socketDir = resolve(".local/socket");
const username = userInfo().username;
const connection = new URL("postgresql://localhost:55433/revisit_test");
connection.username = username;
connection.searchParams.set("host", socketDir);
const env = {
  ...process.env,
  REVISIT_DATABASE_URL: connection.toString(),
  REVISIT_INTEGRATION: "1",
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "",
  OPENROUTER_API_KEY: "",
  NVIDIA_API_KEY: "",
  AI_PROVIDER: "",
  AI_MODEL: "",
};

async function run(args: string[]): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", ...args], { stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`Integration subprocess failed (${signal ?? code}): ${args.join(" ")}`));
    });
  });
}

const admin = new Pool({ host: socketDir, port: 55433, user: username, database: "postgres", max: 1, connectionTimeoutMillis: 5_000 });
try {
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname='revisit_test'");
    if (!existing.rowCount) await admin.query("CREATE DATABASE revisit_test");
  } finally {
    await admin.end();
  }
  await run(["scripts/setup.ts"]);
  await run(["--test", "--test-timeout=45000", "tests/integration.test.ts"]);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
