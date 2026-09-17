import { randomUUID } from "node:crypto";
import { answerRecorded, validateClaims } from "@/domain/engine";
import { answerSchema } from "@/domain/schemas";
import type { Answer, Source } from "@/domain/types";
import { pool } from "./db";
import { getSnapshot, getSources } from "./repository";
import { answerLive } from "./ai";
import { AppError } from "./errors";

export async function askQuestion(question: string, snapshotId: string): Promise<Answer> {
  const start = performance.now();
  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) throw new AppError("SNAPSHOT_NOT_FOUND", "Run a review before asking about its evidence.", 404);
  const available = (await getSources()).filter((source) => snapshot.sourceIds.includes(source.id));
  validateClaims(snapshot.claims, available);
  const ranked = await pool.query<{ source_id: string }>("SELECT source_id,MAX(ts_rank(search_vector,websearch_to_tsquery('english',$1))) AS rank FROM source_chunks WHERE source_id=ANY($2::text[]) AND search_vector @@ websearch_to_tsquery('english',$1) GROUP BY source_id ORDER BY rank DESC LIMIT 6", [question, snapshot.sourceIds]);
  const selected = new Set(ranked.rows.map((row) => row.source_id));
  // Review context and the opposing evidence travel together, even if only one side matches the query.
  for (const claim of snapshot.claims) {
    if (snapshot.findings.some((finding) => ["conflict", "change"].includes(finding.kind) && finding.claimIds.includes(claim.id))) selected.add(claim.sourceId);
  }
  const sources: Source[] = available.filter((source) => selected.has(source.id));
  const context = sources.length ? sources : available;
  let model: string | null = null;
  let tokens: number | null = null;
  let answer: Answer;
  if (snapshot.mode === "recorded") {
    // Recorded answers use a curated context pack; their actual citations, not search rankings, define retrieval.
    answer = answerRecorded(question, snapshot);
  } else {
    const result = await answerLive(question, snapshot, context);
    answer = result.answer;
    model = result.model;
    tokens = result.tokens;
  }
  answer = answerSchema.parse(answer);
  const claims = new Map(snapshot.claims.map((claim) => [claim.id, claim]));
  for (const paragraph of answer.paragraphs) {
    if (!paragraph.claimIds.length) throw new AppError("UNGROUNDED_ANSWER", "The answer lacked supporting evidence. Try a more specific question.", 422);
    for (const id of paragraph.claimIds) if (!claims.has(id)) throw new AppError("INVALID_CITATION", "The answer referenced evidence outside this snapshot.", 422);
  }
  if (answer.retrievedSourceIds.some((id) => !snapshot.sourceIds.includes(id))) throw new AppError("INVALID_SOURCE", "The answer referenced a source outside this snapshot.", 422);
  await pool.query("INSERT INTO questions(id,snapshot_id,question,answer,retrieved_source_ids,mode,model,tokens,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [randomUUID(), snapshotId, question, JSON.stringify(answer), JSON.stringify(answer.retrievedSourceIds), answer.mode, model, tokens, Math.round(performance.now() - start)]);
  return answer;
}
