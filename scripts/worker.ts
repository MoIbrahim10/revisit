import { getQueue, REVIEW_QUEUE } from "../src/server/queue";
import { executeRun } from "../src/server/workflow";
import { pool } from "../src/server/db";
import { syncTerminalRuns } from "../src/server/recovery";

const queue = await getQueue();
const workerOptions = { includeMetadata: true, pollingIntervalSeconds: 1, batchSize: 1 } as const;
await queue.work<{ runId: string }, unknown, typeof workerOptions>(REVIEW_QUEUE, workerOptions, async (jobs) => {
  for (const job of jobs) await executeRun(job.data.runId, job.retryCount);
});
console.info(JSON.stringify({ event: "worker_ready", queue: REVIEW_QUEUE }));
const recoveryTimer = setInterval(() => { void syncTerminalRuns().catch((error: unknown) => console.error(JSON.stringify({ event: "recovery_failed", message: error instanceof Error ? error.message : "Unknown error" }))); }, 5000);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(recoveryTimer);
  await queue.stop({ graceful: true, timeout: 50000 });
  await pool.end();
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
