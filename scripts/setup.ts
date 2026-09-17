import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { userInfo } from "node:os";
import { Pool } from "pg";
import { pool, transaction } from "../src/server/db";
import { company, baseline, sources } from "../src/fixtures/lattice";
import { putSource, createRun, getSnapshot } from "../src/server/repository";
import { executeRun } from "../src/server/workflow";
import { getQueue, stopQueue, REVIEW_QUEUE } from "../src/server/queue";

async function setup() {
  if (!process.env.REVISIT_DATABASE_URL) {
    const dataDir = resolve(".local/postgres");
    const socketDir = resolve(".local/socket");
    mkdirSync(socketDir, { recursive: true });
    if (!existsSync(resolve(dataDir, "PG_VERSION"))) execFileSync("initdb", ["-D", dataDir, "--encoding=UTF8", "--no-locale"], { stdio: "inherit" });
    const admin = new Pool({ host: socketDir, port: 55433, user: userInfo().username, database: "postgres" });
    try {
      try { await admin.query("SELECT 1"); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ECONNREFUSED") throw error;
        execFileSync("pg_ctl", ["-D", dataDir, "-l", resolve(".local/postgres.log"), "-o", `-k '${socketDir}' -p 55433 -h ''`, "-w", "start"], { stdio: "inherit" });
      }
      const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname='revisit'");
      if (!existing.rowCount) await admin.query("CREATE DATABASE revisit");
    } finally { await admin.end(); }
  }
  await transaction(async (client) => {
    await client.query(readFileSync(resolve("src/server/schema.sql"), "utf8"));
    await client.query("INSERT INTO companies(id,data,baseline) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING", [company.id, JSON.stringify(company), JSON.stringify(baseline)]);
    for (const source of sources) await putSource(client, source);
  });
  if (!await getSnapshot()) {
    const run = await createRun({ mode: "recorded", idempotencyKey: "initial-demo-review-v1" });
    const success = await executeRun(run.id);
    if (!success) throw new Error("The initial review failed. Inspect analysis_runs for the reported error.");
    await (await getQueue()).complete(REVIEW_QUEUE, run.id, { seeded: true }, { includeQueued: true });
  }
  console.info("Revisit is ready. Fictional sources and an evidence-checked snapshot are stored in the local database.");
}
try { await setup(); }
catch (error) { console.error(error); process.exitCode = 1; }
finally { await stopQueue(); await pool.end(); }
