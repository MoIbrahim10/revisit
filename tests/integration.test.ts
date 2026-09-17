import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { after, before, describe, mock, test } from "node:test";
import type { Source, Snapshot } from "../src/domain/types";
import { baseline, company, sources as fixtureSources, suggestedQuestions } from "../src/fixtures/lattice";
import { pool, transaction } from "../src/server/db";
import { AppError } from "../src/server/errors";
import { askQuestion } from "../src/server/questions";
import { getQueue, REVIEW_QUEUE, stopQueue } from "../src/server/queue";
import { syncTerminalRuns } from "../src/server/recovery";
import { addSource, createRun, getDecisionExport, getInputSources, getRun, getSnapshot, getSources, putSource, retryRun, saveDecision } from "../src/server/repository";
import { executeRun } from "../src/server/workflow";

const queuedRunIds = new Set<string>();
const key = () => `integration-${randomUUID()}`;
let initialSnapshot: Snapshot;

function hasAppError(code: string, status: number) {
  return (error: unknown) => error instanceof AppError && error.code === code && error.status === status;
}

function hasPgCode(code: string) {
  return (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function createRecordedRun(recoveryTest = false) {
  const input = { mode: "recorded" as const, idempotencyKey: key(), recoveryTest };
  const run = await createRun(input);
  queuedRunIds.add(run.id);
  return { run, input };
}

async function snapshotForRun(runId: string): Promise<Snapshot> {
  const result = await pool.query<{ data: Snapshot }>("SELECT data FROM snapshots WHERE run_id=$1", [runId]);
  assert.equal(result.rowCount, 1);
  return result.rows[0].data;
}

function additionalSource(companyId: string): Source {
  const body = `Integration-only source ${randomUUID()}. This material is created inside a rolled-back transaction.`;
  return {
    ...fixtureSources[0],
    id: randomUUID(),
    companyId,
    title: "Integration-only source",
    body,
    contentHash: createHash("sha256").update(body).digest("hex"),
  };
}

describe("isolated PostgreSQL workflow integration", { concurrency: false }, () => {
  before(async () => {
    assert.equal(process.env.REVISIT_INTEGRATION, "1", "Run integration tests through npm run test:integration.");
    const url = new URL(process.env.REVISIT_DATABASE_URL ?? "http://invalid");
    assert.equal(url.protocol, "postgresql:");
    assert.equal(url.pathname, "/revisit_test");
    assert.equal(url.port, "55433");
    assert.equal(url.searchParams.get("host"), resolve(".local/socket"));
    const database = await pool.query<{ name: string }>("SELECT current_database() AS name");
    assert.equal(database.rows[0].name, "revisit_test");
    const seeded = await getSnapshot();
    assert.ok(seeded, "The integration harness must seed the isolated database first.");
    initialSnapshot = seeded;
  });

  after(async () => {
    try {
      if (queuedRunIds.size) {
        await (await getQueue()).complete(REVIEW_QUEUE, [...queuedRunIds], { integration: true }, { includeQueued: true });
      }
    } finally {
      try { await stopQueue(); }
      finally { await pool.end(); }
    }
  });

  test("enqueue commits the run, frozen manifest, and one queue job with idempotency", async () => {
    const { run, input } = await createRecordedRun();
    assert.equal(run.status, "queued");
    const same = await createRun(input);
    assert.equal(same.id, run.id);
    const manifest = await getInputSources(run.id);
    assert.deepEqual(manifest.map((source) => source.id).sort(), fixtureSources.map((source) => source.id).sort());
    const jobs = await (await getQueue()).findJobs<{ runId: string }>(REVIEW_QUEUE, { id: run.id });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].data.runId, run.id);
    await assert.rejects(createRun({ ...input, recoveryTest: true }), hasAppError("IDEMPOTENCY_CONFLICT", 409));
    assert.equal(await executeRun(run.id), true);
  });

  test("an error after queue insertion rolls back both the application run and queue job", async () => {
    const queue = await getQueue();
    const send = queue.send.bind(queue);
    const requestKey = key();
    const failure = new Error("Intentional failure after transactional enqueue");
    let queuedId: string | null = null;
    const stub = mock.method(queue, "send", async (...args: Parameters<typeof queue.send>) => {
      queuedId = await send(...args);
      throw failure;
    });
    try {
      await assert.rejects(createRun({ mode: "recorded", idempotencyKey: requestKey }), (error: unknown) => error === failure);
    } finally {
      stub.mock.restore();
    }
    assert.ok(queuedId);
    const runs = await pool.query("SELECT id FROM analysis_runs WHERE company_id=$1 AND idempotency_key=$2", [company.id, requestKey]);
    assert.equal(runs.rowCount, 0);
    assert.equal((await queue.findJobs(REVIEW_QUEUE, { id: queuedId })).length, 0);
    const inputs = await pool.query("SELECT source_id FROM run_inputs WHERE run_id=$1", [queuedId]);
    assert.equal(inputs.rowCount, 0);
  });

  test("a source added after enqueue cannot enter that run's frozen manifest", async () => {
    const { run } = await createRecordedRun();
    const late = additionalSource(company.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await putSource(client, late);
      const visible = await client.query("SELECT id FROM source_versions WHERE id=$1", [late.id]);
      assert.equal(visible.rowCount, 1);
      const manifest = await client.query("SELECT source_id FROM run_inputs WHERE run_id=$1", [run.id]);
      assert.deepEqual(manifest.rows.map((row) => row.source_id).sort(), fixtureSources.map((source) => source.id).sort());
      assert.ok(!manifest.rows.some((row) => row.source_id === late.id));
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    assert.equal(await executeRun(run.id), true);
    assert.ok(!(await snapshotForRun(run.id)).sourceIds.includes(late.id));
  });

  test("stored custom evidence cannot break a subsequent recorded review", async () => {
    // Fixed content deduplicates across reruns in revisit_test; the application database is never used.
    const custom = await addSource({
      title: "Custom evidence regression",
      kind: "note",
      effectiveDate: "2026-07-31",
      body: "Integration-only custom evidence remains available for live analysis and must not enter the unchanged recorded source pack.",
    });
    assert.ok((await getSources()).some((source) => source.id === custom.id));
    const { run } = await createRecordedRun();
    const inputs = await getInputSources(run.id);
    assert.deepEqual(inputs.map((source) => source.id).sort(), fixtureSources.map((source) => source.id).sort());
    assert.ok(!inputs.some((source) => source.id === custom.id));
    assert.equal(await executeRun(run.id), true);
    assert.ok(!(await snapshotForRun(run.id)).sourceIds.includes(custom.id));
    assert.ok((await getSources()).some((source) => source.id === custom.id));
  });

  test("duplicate source text preserves the original and rejects changed metadata", async () => {
    const input = {
      title: "Duplicate source regression",
      kind: "note" as const,
      effectiveDate: "2026-07-31",
      body: "Integration-only duplicate source text must preserve its original title, document type, and effective date.",
    };
    const original = await addSource(input);
    const duplicates = await Promise.all([addSource(input), addSource(input)]);
    assert.deepEqual(duplicates, [original, original]);
    for (const changed of [
      { ...input, title: "Different source title" },
      { ...input, kind: "deck" as const },
      { ...input, effectiveDate: "2026-08-31" },
    ]) {
      await assert.rejects(addSource(changed), hasAppError("SOURCE_METADATA_CONFLICT", 409));
    }
    const stored = await pool.query<{ data: Source }>("SELECT data FROM source_versions WHERE company_id=$1 AND content_hash=$2", [company.id, original.contentHash]);
    assert.equal(stored.rowCount, 1);
    assert.deepEqual(stored.rows[0].data, original);
  });

  test("a transient extraction failure resumes from completed ingestion and publishes exactly once", async () => {
    const { run } = await createRecordedRun(true);
    await assert.rejects(executeRun(run.id), hasAppError("SIMULATED_TIMEOUT", 503));
    const failed = await getRun(run.id);
    assert.equal(failed.status, "retrying");
    assert.deepEqual(failed.executions.map((stage) => [stage.stage, stage.status, stage.attempt]), [["ingest", "completed", 1], ["extract", "failed", 1]]);
    assert.equal((await pool.query("SELECT id FROM snapshots WHERE run_id=$1", [run.id])).rowCount, 0);
    assert.equal(await executeRun(run.id, 1), true);
    const completed = await getRun(run.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.error, null);
    assert.ok(completed.completedAt);
    assert.equal(completed.executions.filter((stage) => stage.stage === "ingest").length, 1);
    assert.deepEqual(completed.executions.filter((stage) => stage.stage === "extract").map((stage) => [stage.attempt, stage.status]), [[1, "failed"], [2, "completed"]]);
    assert.equal(completed.executions.filter((stage) => stage.status === "completed").length, 6);
    assert.ok(completed.executions.every((stage) => stage.tokens === null));
    const snapshot = await snapshotForRun(run.id);
    assert.equal(snapshot.mode, "recorded");
    const beforeCounts = await pool.query("SELECT (SELECT COUNT(*) FROM claims WHERE run_id=$1) AS claims,(SELECT COUNT(*) FROM evidence WHERE run_id=$1) AS evidence", [run.id]);
    assert.equal(Number(beforeCounts.rows[0].claims), snapshot.claims.length);
    assert.equal(Number(beforeCounts.rows[0].evidence), snapshot.claims.length);
    assert.equal(await executeRun(run.id, 2), true);
    assert.equal((await getRun(run.id)).executions.length, completed.executions.length);
    assert.equal((await snapshotForRun(run.id)).id, snapshot.id);
    const afterCounts = await pool.query("SELECT (SELECT COUNT(*) FROM claims WHERE run_id=$1) AS claims,(SELECT COUNT(*) FROM evidence WHERE run_id=$1) AS evidence", [run.id]);
    assert.deepEqual(afterCounts.rows, beforeCounts.rows);
  });

  test("a competing delivery cannot alter the run held by another worker", async () => {
    const { run } = await createRecordedRun();
    const guard = await pool.connect();
    try {
      await guard.query("SELECT pg_advisory_lock(hashtext($1))", [run.id]);
      await assert.rejects(executeRun(run.id), hasAppError("RUN_BUSY", 409));
      const unchanged = await getRun(run.id);
      assert.equal(unchanged.status, "queued");
      assert.equal(unchanged.error, null);
      assert.equal(unchanged.executions.length, 0);
    } finally {
      await guard.query("SELECT pg_advisory_unlock(hashtext($1))", [run.id]);
      guard.release();
    }
    assert.equal(await executeRun(run.id), true);
  });

  test("an exhausted queue job recovers an interrupted stage and supports an explicit retry", async () => {
    const { run } = await createRecordedRun(true);
    await assert.rejects(executeRun(run.id), hasAppError("SIMULATED_TIMEOUT", 503));
    const queue = await getQueue();
    const exhaustedJobId = await queue.send(REVIEW_QUEUE, { runId: run.id }, { retryLimit: 0 });
    assert.ok(exhaustedJobId);
    queuedRunIds.add(exhaustedJobId);
    await transaction(async (client) => {
      await client.query("UPDATE analysis_runs SET status='running',queue_job_id=$2,error=NULL WHERE id=$1", [run.id, exhaustedJobId]);
      await client.query("INSERT INTO stage_executions(id,run_id,stage,attempt,status,input_hash) VALUES($1,$2,'extract',2,'running','integration-interrupted')", [randomUUID(), run.id]);
    });
    await queue.fail(REVIEW_QUEUE, exhaustedJobId, { message: "Integration test: worker interrupted on its last attempt" });
    assert.equal((await queue.findJobs(REVIEW_QUEUE, { id: exhaustedJobId }))[0].state, "failed");
    const guard = await pool.connect();
    try {
      await guard.query("SELECT pg_advisory_lock(hashtext($1))", [run.id]);
      await syncTerminalRuns();
      assert.equal((await getRun(run.id)).status, "running");
    } finally {
      await guard.query("SELECT pg_advisory_unlock(hashtext($1))", [run.id]);
      guard.release();
    }
    await syncTerminalRuns();
    const interrupted = await getRun(run.id);
    assert.equal(interrupted.status, "failed");
    assert.ok(interrupted.completedAt);
    assert.equal(interrupted.executions.find((stage) => stage.stage === "ingest")?.status, "completed");
    assert.equal(interrupted.executions.find((stage) => stage.stage === "extract" && stage.attempt === 2)?.status, "failed");
    assert.equal((await retryRun(run.id)).status, "queued");
    const retryJob = await pool.query<{ queue_job_id: string }>("SELECT queue_job_id FROM analysis_runs WHERE id=$1", [run.id]);
    assert.notEqual(retryJob.rows[0].queue_job_id, exhaustedJobId);
    queuedRunIds.add(retryJob.rows[0].queue_job_id);
    await syncTerminalRuns();
    assert.equal((await getRun(run.id)).status, "queued", "An obsolete failed job must not fail the current retry.");
    assert.equal(await executeRun(run.id), true);
    const resumed = await getRun(run.id);
    assert.equal(resumed.executions.filter((stage) => stage.stage === "ingest").length, 1);
    assert.equal(resumed.executions.find((stage) => stage.stage === "extract" && stage.attempt === 3)?.status, "completed");
    await snapshotForRun(run.id);
  });

  test("decision retries preserve one immutable decision and its original snapshot after a newer review", async () => {
    const input = { snapshotId: initialSnapshot.id, action: "clarify" as const, rationale: "Reconcile the customer counts before arranging a meeting.", idempotencyKey: key() };
    const decision = await saveDecision(input);
    assert.deepEqual(await saveDecision(input), decision);
    await assert.rejects(saveDecision({ ...input, action: "meeting" }), hasAppError("IDEMPOTENCY_CONFLICT", 409));
    await assert.rejects(saveDecision({ ...input, rationale: "A different rationale for the same request key." }), hasAppError("IDEMPOTENCY_CONFLICT", 409));
    const { run } = await createRecordedRun();
    assert.equal(await executeRun(run.id), true);
    const newer = await snapshotForRun(run.id);
    assert.notEqual(newer.id, initialSnapshot.id);
    assert.equal((await getSnapshot())?.id, newer.id);
    const exported = await getDecisionExport(decision.id);
    assert.equal(exported.delivery, "unsent");
    assert.equal(exported.decision.snapshotId, initialSnapshot.id);
    assert.deepEqual(exported.snapshot, initialSnapshot);
    assert.deepEqual(exported.thesis, baseline);
    assert.equal((await pool.query("SELECT id FROM decisions WHERE company_id=$1 AND idempotency_key=$2", [company.id, input.idempotencyKey])).rowCount, 1);
  });

  test("foreign-company input and evidence references are rejected by database constraints", async () => {
    const companyId = randomUUID();
    const foreign = additionalSource(companyId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO companies(id,data,baseline) VALUES($1,$2,$3)", [companyId, JSON.stringify({ ...company, id: companyId }), JSON.stringify(baseline)]);
      await putSource(client, foreign);
      await client.query("SAVEPOINT input_scope");
      await assert.rejects(client.query("INSERT INTO run_inputs(run_id,company_id,source_id) VALUES($1,$2,$3)", [initialSnapshot.runId, company.id, foreign.id]), hasPgCode("23503"));
      await client.query("ROLLBACK TO SAVEPOINT input_scope");
      const claim = { ...initialSnapshot.claims[0], id: randomUUID() };
      await client.query("INSERT INTO claims(run_id,id,source_id,metric,effective_date,data) VALUES($1,$2,$3,$4,$5,$6)", [initialSnapshot.runId, claim.id, claim.sourceId, claim.metric, claim.asOf, JSON.stringify(claim)]);
      await assert.rejects(client.query("INSERT INTO evidence(run_id,claim_id,source_id,quote,start_offset,end_offset) VALUES($1,$2,$3,$4,$5,$6)", [initialSnapshot.runId, claim.id, foreign.id, "Integration-only", 0, 16]), hasPgCode("23503"));
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    assert.equal((await pool.query("SELECT id FROM companies WHERE id=$1", [companyId])).rowCount, 0);
  });

  test("recorded questions persist explicit unknowns and resolve citations within the snapshot company", async () => {
    const unsupported = `What is runway? ${randomUUID()}`;
    const unknown = await askQuestion(unsupported, initialSnapshot.id);
    assert.deepEqual(unknown.paragraphs, []);
    assert.ok(unknown.unknowns.length > 0);
    assert.deepEqual(unknown.retrievedSourceIds, []);
    const stored = await pool.query("SELECT answer,mode,model,tokens FROM questions WHERE snapshot_id=$1 AND question=$2", [initialSnapshot.id, unsupported]);
    assert.equal(stored.rowCount, 1);
    assert.deepEqual(stored.rows[0].answer, unknown);
    assert.equal(stored.rows[0].mode, "recorded");
    assert.equal(stored.rows[0].model, null);
    assert.equal(stored.rows[0].tokens, null);
    const answer = await askQuestion(suggestedQuestions[2], initialSnapshot.id);
    assert.ok(answer.paragraphs.length > 0);
    const citedIds = answer.paragraphs.flatMap((paragraph) => paragraph.claimIds);
    const citedClaims = initialSnapshot.claims.filter((claim) => citedIds.includes(claim.id));
    assert.equal(new Set(citedIds).size, citedClaims.length);
    assert.ok(answer.retrievedSourceIds.every((id) => initialSnapshot.sourceIds.includes(id)));
    const owners = await pool.query("SELECT company_id FROM source_versions WHERE id=ANY($1::text[])", [citedClaims.map((claim) => claim.sourceId)]);
    assert.ok(owners.rows.every((row) => row.company_id === company.id));
  });

  test("a snapshot from another company cannot be queried or used for a decision", async () => {
    const foreignCompanyId = randomUUID();
    const foreignRunId = randomUUID();
    const foreignSnapshotId = randomUUID();
    await transaction(async (client) => {
      await client.query("INSERT INTO companies(id,data,baseline) VALUES($1,$2,$3)", [foreignCompanyId, JSON.stringify({ ...company, id: foreignCompanyId }), JSON.stringify(baseline)]);
      await client.query("INSERT INTO analysis_runs(id,company_id,mode,status,idempotency_key,completed_at) VALUES($1,$2,'recorded','completed',$3,now())", [foreignRunId, foreignCompanyId, key()]);
      await client.query("INSERT INTO snapshots(id,run_id,company_id,data) VALUES($1,$2,$3,$4)", [foreignSnapshotId, foreignRunId, foreignCompanyId, JSON.stringify({ ...initialSnapshot, id: foreignSnapshotId, runId: foreignRunId, companyId: foreignCompanyId, claims: [], sourceIds: [], findings: [], criteria: [], founderQuestions: [] })]);
    });
    assert.equal(await getSnapshot(foreignSnapshotId), null);
    await assert.rejects(askQuestion(suggestedQuestions[0], foreignSnapshotId), hasAppError("SNAPSHOT_NOT_FOUND", 404));
    await assert.rejects(saveDecision({ snapshotId: foreignSnapshotId, action: "track", rationale: "This decision must never cross company scope.", idempotencyKey: key() }), hasAppError("SNAPSHOT_NOT_FOUND", 404));
  });
});
