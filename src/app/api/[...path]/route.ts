import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, errorMessage } from "@/server/errors";
import { addSource, createRun, decisionInputSchema, getDecisionExport, getRun, getWorkspace, retryRun, runInputSchema, saveDecision, sourceInputSchema } from "@/server/repository";
import { askQuestion } from "@/server/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function input(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("EMPTY_BODY", "Provide a JSON request body.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 100000) { await reader.cancel(); throw new AppError("BODY_TOO_LARGE", "This request exceeds the 100 KB limit.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AppError("INVALID_JSON", "The request body must be valid JSON."); }
}
async function handle(request: Request, context: Context): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { path } = await context.params;
    if (request.method === "POST") {
      const origin = request.headers.get("origin");
      if (origin && new URL(origin).host !== request.headers.get("host")) throw new AppError("INVALID_ORIGIN", "Submit changes from this workspace.", 403);
    }
    let data: unknown;
    let status = 200;
    if (request.method === "GET" && path.join("/") === "workspace") data = await getWorkspace();
    else if (request.method === "GET" && path[0] === "runs" && path.length === 2) data = await getRun(z.uuid().parse(path[1]));
    else if (request.method === "GET" && path[0] === "decisions" && path[2] === "export" && path.length === 3) {
      const payload = await getDecisionExport(z.uuid().parse(path[1]));
      return new Response(JSON.stringify(payload, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="revisit-decision-${path[1]}.json"`, "Cache-Control": "no-store" } });
    } else if (request.method === "POST" && path.join("/") === "runs") {
      data = await createRun(runInputSchema.parse(await input(request))); status = 202;
    } else if (request.method === "POST" && path[0] === "runs" && path[2] === "retry" && path.length === 3) {
      data = await retryRun(z.uuid().parse(path[1])); status = 202;
    } else if (request.method === "POST" && path.join("/") === "sources") {
      data = await addSource(sourceInputSchema.parse(await input(request))); status = 201;
    } else if (request.method === "POST" && path.join("/") === "decisions") {
      data = await saveDecision(decisionInputSchema.parse(await input(request))); status = 201;
    } else if (request.method === "POST" && path.join("/") === "questions") {
      const body = z.object({ question: z.string().trim().min(5).max(1000), snapshotId: z.uuid() }).parse(await input(request));
      data = await askQuestion(body.question, body.snapshotId);
    } else throw new AppError("NOT_FOUND", "This endpoint does not exist.", 404);
    return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: { code: "VALIDATION_ERROR", message: error.issues.slice(0,3).map((issue) => `${issue.path.join(".") || "Input"}: ${issue.message}`).join("; "), retryable: false, requestId } }, { status: 422 });
    if (error instanceof AppError) return Response.json({ error: { code: error.code, message: error.message, retryable: error.retryable, requestId } }, { status: error.status });
    if (error && typeof error === "object" && "retryable" in error && "code" in error) return Response.json({ error: { code: String(error.code), message: errorMessage(error), retryable: Boolean(error.retryable), requestId } }, { status: error.retryable ? 503 : 422 });
    console.error(JSON.stringify({ event: "request_failed", requestId, message: errorMessage(error) }));
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "The workspace could not complete this request. Check that the local database and worker are running.", retryable: true, requestId } }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
