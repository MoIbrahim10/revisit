import { randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, transaction } from "./db";
import { AppError } from "./errors";
import { getQueue, REVIEW_QUEUE } from "./queue";
import { company, baseline, sources as fixtureSources } from "@/fixtures/lattice";
import { isLiveAvailable } from "./ai";
import { syncTerminalRuns } from "./recovery";
import type { Decision, Mode, Run, Snapshot, Source, StageExecution, WorkspaceData } from "@/domain/types";

export const sourceInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  kind: z.enum(["note", "deck", "financial", "website"]),
  body: z.string().trim().min(20).max(20000),
  effectiveDate: z.iso.date(),
});
export const runInputSchema = z.object({ mode: z.enum(["recorded", "live"]), idempotencyKey: z.string().min(8).max(100), recoveryTest: z.boolean().optional() });
export const decisionInputSchema = z.object({ snapshotId: z.uuid(), action: z.enum(["track", "clarify", "meeting"]), rationale: z.string().trim().min(10).max(2000), idempotencyKey: z.string().min(8).max(100) });

export async function getSources(): Promise<Source[]> {
  const { rows } = await pool.query<{ data: Source }>("SELECT data FROM source_versions WHERE company_id=$1 ORDER BY created_at,id", [company.id]);
  return rows.map((row) => row.data);
}
export async function getInputSources(runId: string): Promise<Source[]> {
  const { rows } = await pool.query<{ data: Source }>("SELECT s.data FROM run_inputs i JOIN source_versions s ON s.id=i.source_id WHERE i.run_id=$1 AND i.company_id=$2 ORDER BY s.created_at,s.id", [runId, company.id]);
  return rows.map((row) => row.data);
}
export async function putSource(client: PoolClient, source: Source): Promise<Source> {
  const { rows } = await client.query<{ data: Source }>(
    "INSERT INTO source_versions(id,company_id,title,content_hash,body,data) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING data",
    [source.id, source.companyId, source.title, source.contentHash, source.body, JSON.stringify(source)],
  );
  const stored = rows[0].data;
  let offset = 0;
  for (const [ordinal, paragraph] of stored.body.split(/\n\s*\n/).entries()) {
    const start = stored.body.indexOf(paragraph, offset);
    await client.query("INSERT INTO source_chunks(id,source_id,ordinal,body,start_offset) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_id,ordinal) DO NOTHING", [`${stored.id}:${ordinal}`, stored.id, ordinal, paragraph, start]);
    offset = start + paragraph.length;
  }
  return stored;
}
export async function addSource(input: z.infer<typeof sourceInputSchema>): Promise<Source> {
  const source: Source = { ...input, id: randomUUID(), companyId: company.id, capturedAt: new Date().toISOString(), publisherGroup: "user-provided", locator: "Pasted source", contentHash: createHash("sha256").update(input.body).digest("hex") };
  return transaction(async (client) => {
    const stored = await putSource(client, source);
    if (stored.title !== source.title || stored.kind !== source.kind || stored.effectiveDate !== source.effectiveDate) {
      throw new AppError("SOURCE_METADATA_CONFLICT", `This source text is already saved as “${stored.title}” with a different title, document type, or effective date. The existing source was not changed.`, 409);
    }
    return stored;
  });
}

export async function getRun(id: string): Promise<Run> {
  const { rows } = await pool.query("SELECT id,status,mode,created_at,completed_at,error,recovery_test FROM analysis_runs WHERE id=$1 AND company_id=$2", [id, company.id]);
  if (!rows[0]) throw new AppError("RUN_NOT_FOUND", "This review run could not be found.", 404);
  const row = rows[0];
  const steps = await pool.query("SELECT stage,attempt,status,started_at,duration_ms,error,model,tokens FROM stage_executions WHERE run_id=$1 ORDER BY started_at,attempt", [id]);
  const executions: StageExecution[] = steps.rows.map((step) => ({ stage: step.stage, attempt: step.attempt, status: step.status, startedAt: step.started_at.toISOString(), durationMs: step.duration_ms, error: step.error, model: step.model, tokens: step.tokens }));
  return { id: row.id, status: row.status, mode: row.mode, createdAt: row.created_at.toISOString(), completedAt: row.completed_at?.toISOString() ?? null, error: row.error, recoveryTest: row.recovery_test, executions };
}
export async function createRun(input: { mode: Mode; idempotencyKey: string; recoveryTest?: boolean }): Promise<Run> {
  if (input.mode === "live" && !isLiveAvailable()) throw new AppError("LIVE_NOT_CONFIGURED", "Live mode needs a valid server-side provider, model, and matching API key. Recorded mode is ready to use.", 422);
  const queue = await getQueue();
  const id = await transaction(async (client) => {
    const runId = randomUUID();
    const result = await client.query("INSERT INTO analysis_runs(id,company_id,mode,status,idempotency_key,recovery_test,queue_job_id,baseline_snapshot) SELECT $1,id,$3,'queued',$4,$5,$1,baseline FROM companies WHERE id=$2 ON CONFLICT(company_id,idempotency_key) DO NOTHING RETURNING id", [runId, company.id, input.mode, input.idempotencyKey, input.recoveryTest ?? false]);
    if (!result.rowCount) {
      const prior = await client.query("SELECT id,mode,recovery_test FROM analysis_runs WHERE company_id=$1 AND idempotency_key=$2", [company.id, input.idempotencyKey]);
      if (prior.rows[0].mode !== input.mode || prior.rows[0].recovery_test !== (input.recoveryTest ?? false)) throw new AppError("IDEMPOTENCY_CONFLICT", "This request key was already used with different review options.", 409);
      return prior.rows[0].id as string;
    }
    const sourceIds = input.mode === "recorded" ? fixtureSources.map((source) => source.id) : null;
    await client.query("INSERT INTO run_inputs(run_id,company_id,source_id) SELECT $1,company_id,id FROM source_versions WHERE company_id=$2 AND ($3::text[] IS NULL OR id=ANY($3::text[]))", [runId, company.id, sourceIds]);
    await queue.send(REVIEW_QUEUE, { runId }, { id: runId, db: { executeSql: (text, values) => client.query(text, values) } });
    return runId;
  });
  return getRun(id);
}
export async function retryRun(id: string): Promise<Run> {
  const queue = await getQueue();
  await transaction(async (client) => {
    const result = await client.query("UPDATE analysis_runs SET status='queued',error=NULL,completed_at=NULL WHERE id=$1 AND company_id=$2 AND status='failed' RETURNING id", [id, company.id]);
    if (!result.rowCount) throw new AppError("RUN_NOT_RETRYABLE", "Only a failed review can be retried. An active review is already processing.", 409);
    const queueId = await queue.send(REVIEW_QUEUE, { runId: id }, { db: { executeSql: (text, values) => client.query(text, values) } });
    await client.query("UPDATE analysis_runs SET queue_job_id=$2 WHERE id=$1", [id, queueId]);
  });
  return getRun(id);
}
export async function getSnapshot(id?: string): Promise<Snapshot | null> {
  const result = id
    ? await pool.query<{ data: Snapshot }>("SELECT data FROM snapshots WHERE company_id=$1 AND id=$2", [company.id, id])
    : await pool.query<{ data: Snapshot }>("SELECT data FROM snapshots WHERE company_id=$1 ORDER BY created_at DESC LIMIT 1", [company.id]);
  return result.rows[0]?.data ?? null;
}
function mapDecision(row: Record<string, unknown>): Decision {
  return { id: row.id as string, snapshotId: row.snapshot_id as string, action: row.action as Decision["action"], rationale: row.rationale as string, createdAt: (row.created_at as Date).toISOString() };
}
export async function saveDecision(input: z.infer<typeof decisionInputSchema>): Promise<Decision> {
  return transaction(async (client) => {
    const snapshot = await client.query("SELECT s.id,r.baseline_snapshot FROM snapshots s JOIN analysis_runs r ON r.id=s.run_id WHERE s.id=$1 AND s.company_id=$2", [input.snapshotId, company.id]);
    if (!snapshot.rowCount) throw new AppError("SNAPSHOT_NOT_FOUND", "The reviewed snapshot is not available.", 404);
    const result = await client.query("INSERT INTO decisions(id,company_id,snapshot_id,action,rationale,thesis_snapshot,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(company_id,idempotency_key) DO NOTHING RETURNING *", [randomUUID(), company.id, input.snapshotId, input.action, input.rationale, JSON.stringify(snapshot.rows[0].baseline_snapshot ?? baseline), input.idempotencyKey]);
    if (result.rowCount) return mapDecision(result.rows[0]);
    const prior = await client.query("SELECT * FROM decisions WHERE company_id=$1 AND idempotency_key=$2", [company.id, input.idempotencyKey]);
    const row = prior.rows[0];
    if (row.snapshot_id !== input.snapshotId || row.action !== input.action || row.rationale !== input.rationale) throw new AppError("IDEMPOTENCY_CONFLICT", "This request key was used for a different decision.", 409);
    return mapDecision(row);
  });
}
export async function getDecisionExport(id: string) {
  const { rows } = await pool.query("SELECT * FROM decisions WHERE id=$1 AND company_id=$2", [id, company.id]);
  if (!rows[0]) throw new AppError("DECISION_NOT_FOUND", "This decision could not be found.", 404);
  const decision = mapDecision(rows[0]);
  const snapshot = await getSnapshot(decision.snapshotId);
  return { format: "revisit-handoff-v1", delivery: "unsent", fictional: true, company, decision, thesis: rows[0].thesis_snapshot, snapshot };
}
export async function getWorkspace(): Promise<WorkspaceData> {
  await syncTerminalRuns();
  const [sources, snapshot, runRows, decisionRows] = await Promise.all([
    getSources(), getSnapshot(),
    pool.query("SELECT id FROM analysis_runs WHERE company_id=$1 ORDER BY created_at DESC LIMIT 10", [company.id]),
    pool.query("SELECT * FROM decisions WHERE company_id=$1 ORDER BY created_at DESC LIMIT 20", [company.id]),
  ]);
  const runs = await Promise.all(runRows.rows.map((row) => getRun(row.id)));
  return { company, baseline, sources, snapshot, runs, decisions: decisionRows.rows.map(mapDecision), liveAvailable: isLiveAvailable() };
}
