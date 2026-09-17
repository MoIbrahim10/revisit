import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { baseline as initialBaseline, company } from "@/fixtures/lattice";
import { extractRecorded, reconcile, validateAssessment, validateClaims } from "@/domain/engine";
import type { Assessment, Baseline, Claim, Snapshot, Source, Stage } from "@/domain/types";
import { pool, transaction } from "./db";
import { AppError, errorMessage } from "./errors";
import { assessLive, extractLive } from "./ai";
import { getInputSources, getRun } from "./repository";

interface StageResult<T> { data: T; model?: string; tokens?: number }
async function stage<T>(runId: string, name: Stage, input: unknown, work: (attempt: number) => Promise<StageResult<T>>, commit?: (client: PoolClient, data: T) => Promise<void>): Promise<T> {
  const cached = await pool.query<{ output: T }>("SELECT output FROM stage_executions WHERE run_id=$1 AND stage=$2 AND status='completed'", [runId, name]);
  if (cached.rows[0]) return cached.rows[0].output;
  const id = randomUUID();
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const attempt = await transaction(async (client) => {
    await client.query("UPDATE stage_executions SET status='failed',error='Worker interrupted before committing this stage.' WHERE run_id=$1 AND stage=$2 AND status='running'", [runId, name]);
    const count = await client.query("SELECT COALESCE(MAX(attempt),0)+1 AS next FROM stage_executions WHERE run_id=$1 AND stage=$2", [runId, name]);
    const next = Number(count.rows[0].next);
    await client.query("INSERT INTO stage_executions(id,run_id,stage,attempt,status,input_hash) VALUES($1,$2,$3,$4,'running',$5)", [id, runId, name, next, inputHash]);
    return next;
  });
  const start = performance.now();
  console.info(JSON.stringify({ event: "stage_started", runId, stage: name, attempt }));
  try {
    const result = await work(attempt);
    const duration = Math.round(performance.now() - start);
    await transaction(async (client) => {
      if (commit) await commit(client, result.data);
      await client.query("UPDATE stage_executions SET status='completed',output=$2,duration_ms=$3,model=$4,tokens=$5 WHERE id=$1", [id, JSON.stringify(result.data), duration, result.model ?? null, result.tokens ?? null]);
    });
    console.info(JSON.stringify({ event: "stage_completed", runId, stage: name, attempt, durationMs: duration, model: result.model ?? null, tokens: result.tokens ?? null }));
    return result.data;
  } catch (error) {
    await pool.query("UPDATE stage_executions SET status='failed',error=$2,duration_ms=$3 WHERE id=$1", [id, errorMessage(error).slice(0,600), Math.round(performance.now() - start)]);
    console.error(JSON.stringify({ event: "stage_failed", runId, stage: name, attempt, message: errorMessage(error) }));
    throw error;
  }
}

export async function executeRun(runId: string, retryCount = 0): Promise<boolean> {
  // A session lock fences concurrent deliveries without holding a transaction across a model call.
  const guard = await pool.connect();
  let locked = false;
  try {
    const lock = await guard.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [runId]);
    locked = lock.rows[0].locked;
    if (!locked) throw new AppError("RUN_BUSY", "This review is already processing.", 409, true);
    const run = await getRun(runId);
    if (run.status === "completed") return true;
    const context = await pool.query<{ baseline_snapshot: Baseline | null }>("SELECT baseline_snapshot FROM analysis_runs WHERE id=$1", [runId]);
    const baseline = context.rows[0].baseline_snapshot ?? initialBaseline;
    await pool.query("UPDATE analysis_runs SET status='running',error=NULL WHERE id=$1", [runId]);
    const inputs = await getInputSources(runId);
    const sources = await stage<Source[]>(runId, "ingest", inputs.map((source) => [source.id,source.contentHash]), async () => {
      if (!inputs.length) throw new AppError("NO_SOURCES", "Add at least one source before requesting a review.", 422);
      if (inputs.length > 20) throw new AppError("SOURCE_LIMIT", "A review supports up to 20 sources.", 422);
      if (inputs.some((source) => source.companyId !== company.id)) throw new AppError("SOURCE_SCOPE", "A source does not belong to this company.", 422);
      return { data: inputs };
    });
    const claims = await stage<Claim[]>(runId, "extract", sources, async (attempt) => {
      if (run.recoveryTest && attempt === 1) throw new AppError("SIMULATED_TIMEOUT", "Recovery test: the extraction provider timed out. The completed ingestion step is preserved.", 503, true);
      if (run.mode === "recorded") {
        const result = extractRecorded(sources);
        validateClaims(result, sources);
        return { data: result, model: "recorded-fixture-v1" };
      }
      const result = await extractLive(sources);
      validateClaims(result.claims, sources);
      return { data: result.claims, model: result.model, tokens: result.tokens };
    });
    const comparison = await stage<Assessment>(runId, "reconcile", claims, async () => ({ data: reconcile(claims, baseline) }));
    const assessment = await stage<Assessment>(runId, "assess", comparison, async () => {
      if (run.mode === "recorded") return { data: comparison, model: "deterministic-analysis-v1" };
      const result = await assessLive(comparison, claims, baseline);
      return { data: result.assessment, model: result.model, tokens: result.tokens };
    });
    await stage(runId, "verify", { claims, assessment }, async () => {
      validateClaims(claims, sources);
      validateAssessment(assessment, claims);
      return { data: { validatedClaims: claims.length, sources: sources.length, assessmentValidated: true } };
    });
    await stage<Snapshot>(runId, "publish", assessment, async () => ({ data: { ...assessment, id: randomUUID(), companyId: company.id, runId, createdAt: new Date().toISOString(), mode: run.mode, claims, sourceIds: sources.map((source) => source.id) } }), async (client, snapshot) => {
      for (const claim of claims) {
        await client.query("INSERT INTO claims(run_id,id,source_id,metric,effective_date,data) VALUES($1,$2,$3,$4,$5,$6)", [runId, claim.id, claim.sourceId, claim.metric, claim.asOf || null, JSON.stringify(claim)]);
        await client.query("INSERT INTO evidence(run_id,claim_id,source_id,quote,start_offset,end_offset) VALUES($1,$2,$3,$4,$5,$6)", [runId, claim.id, claim.sourceId, claim.quote, claim.start, claim.end]);
      }
      for (const finding of assessment.findings) {
        for (const relatedId of finding.claimIds.slice(1)) {
          await client.query("INSERT INTO claim_links(run_id,from_id,to_id,relationship) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [runId, finding.claimIds[0], relatedId, finding.kind]);
        }
      }
      await client.query("INSERT INTO snapshots(id,run_id,company_id,data) VALUES($1,$2,$3,$4)", [snapshot.id, runId, company.id, JSON.stringify(snapshot)]);
      await client.query("UPDATE analysis_runs SET status='completed',completed_at=now(),error=NULL WHERE id=$1", [runId]);
    });
    return true;
  } catch (error) {
    if (!locked) throw error;
    const retryable = !!(error && typeof error === "object" && "retryable" in error && error.retryable);
    const retry = retryable && retryCount < 2;
    await pool.query("UPDATE analysis_runs SET status=$2,error=$3,completed_at=CASE WHEN $2='failed' THEN now() ELSE NULL END WHERE id=$1 AND status<>'completed'", [runId, retry ? "retrying" : "failed", errorMessage(error).slice(0,600)]);
    if (retry) throw error;
    return false;
  } finally {
    if (locked) await guard.query("SELECT pg_advisory_unlock(hashtext($1))", [runId]);
    guard.release();
  }
}
