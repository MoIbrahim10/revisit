import { pool, transaction } from "./db";
import { getQueue, REVIEW_QUEUE } from "./queue";

/** A process killed on its final attempt cannot update its own failure state. */
export async function syncTerminalRuns(): Promise<void> {
  const { rows } = await pool.query<{ id: string; queue_job_id: string | null }>("SELECT id,queue_job_id FROM analysis_runs WHERE status IN ('queued','running','retrying') ORDER BY created_at LIMIT 20");
  if (!rows.length) return;
  const queue = await getQueue();
  for (const row of rows) {
    const [job] = await queue.findJobs(REVIEW_QUEUE, { id: row.queue_job_id ?? row.id });
    if (!job || !["failed", "cancelled"].includes(job.state)) continue;
    await transaction(async (client) => {
      const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked", [row.id]);
      if (!lock.rows[0].locked) return;
      const changed = await client.query("UPDATE analysis_runs SET status='failed',error='The worker stopped before completing this review. Completed stages are preserved; retry to resume.',completed_at=now() WHERE id=$1 AND COALESCE(queue_job_id,id)=$2 AND status IN ('queued','running','retrying') RETURNING id", [row.id, row.queue_job_id ?? row.id]);
      if (changed.rowCount) await client.query("UPDATE stage_executions SET status='failed',error='Worker interrupted before committing this stage.' WHERE run_id=$1 AND status='running'", [row.id]);
    });
  }
}
