"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight, CircleAlert, Clock3, FilePlus2, FileText, Info, Layers3, Link2, LoaderCircle, MessageSquareText, Plus, RefreshCw, Search, ShieldCheck, Workflow, X } from "lucide-react";
import { STAGES, type Answer, type Claim, type Decision, type DecisionAction, type Mode, type Run, type Source, type WorkspaceData } from "@/domain/types";
import Dialog from "./dialog";
import Disclosure from "./disclosure";
import Toast from "./toast";
import EvidenceDrawer, { formatDate, sourceLabels } from "./evidence-drawer";
const questions = [{
  label: "What changed?",
  text: "What changed since our last review?",
  detail: "Compare the earlier review with today’s evidence."
}, {
  label: "Is the trigger met?",
  text: "Have they met our 25-customer trigger?",
  detail: "Check the customer threshold."
}, {
  label: "Why do the counts differ?",
  text: "Why do the customer numbers disagree?",
  detail: "Inspect the conflicting claims."
}, {
  label: "What should I ask?",
  text: "What should I ask the founders?",
  detail: "Prepare for the founder conversation."
}];
const views = ["Review", "Sources", "Questions", "Decisions", "Activity"] as const;
type View = typeof views[number];
const actions: Record<DecisionAction, {
  label: string;
  description: string;
  past: string;
}> = {
  track: {
    label: "Continue tracking",
    description: "Keep the company on the watchlist.",
    past: "Continue tracking"
  },
  clarify: {
    label: "Request clarification",
    description: "Resolve the open questions first.",
    past: "Clarification needed"
  },
  meeting: {
    label: "Proceed to meeting",
    description: "Take the next conversation with this context.",
    past: "Proceed to meeting"
  }
};
const stageLabels = {
  ingest: "Preserve sources",
  extract: "Extract claims",
  reconcile: "Compare evidence",
  assess: "Check criteria",
  verify: "Verify citations",
  publish: "Save review"
};
const busyStatuses = new Set<Run["status"]>(["queued", "running", "retrying"]);
const statusLabels = {
  met: "Supported",
  unmet: "Not met",
  disputed: "Unresolved",
  unknown: "Unknown"
};
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? `Request failed (${response.status}).`);
  return result as T;
}
function EvidenceLink({
  claimIds,
  onOpen,
  label = "View evidence"
}: {
  claimIds: string[];
  onOpen: (ids: string[]) => void;
  label?: string;
}) {
  return claimIds.length ? <button className="text-button" onClick={() => onOpen(claimIds)}>
    <Link2 size={14} />
    {label}
    <ArrowUpRight size={13} />
  </button> : null;
}
export default function Workspace({
  initialData
}: {
  initialData: WorkspaceData;
}) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<View>("Review");
  const [mode, setMode] = useState<Mode>("recorded");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const [evidence, setEvidence] = useState<{
    sourceIds: string[];
    claimIds: string[];
    claims: Claim[];
  } | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [about, setAbout] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [answerSnapshot, setAnswerSnapshot] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const snapshot = data.snapshot;
  const runs = [...data.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latestRun = runs[0];
  const activeRun = runs.find(run => busyStatuses.has(run.status));
  const activeRunId = activeRun?.id;
  const displayedRun = runs.find(run => run.id === selectedRun) ?? latestRun;
  const decisions = [...data.decisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const customerCriterion = snapshot?.criteria.find(item => item.id === "paying-customers");
  const conflict = snapshot?.findings.find(finding => finding.kind === "conflict" && customerCriterion?.status === "disputed" && finding.claimIds.every(id => customerCriterion.claimIds.includes(id)));
  const customerClaims = snapshot?.claims.filter(claim => customerCriterion?.claimIds.includes(claim.id)) ?? [];
  const baselineSource = data.sources.find(source => source.id === data.baseline.sourceId);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const updated = await request<WorkspaceData>("/api/workspace", {
      signal,
      cache: "no-store"
    });
    if (!signal?.aborted) setData(updated);
    return updated;
  }, []);
  useEffect(() => {
    if (!activeRunId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const updated = await refresh(controller.signal);
        if (controller.signal.aborted) return;
        const run = updated.runs.find(item => item.id === activeRunId);
        if (run?.status === "completed") setNotice({
          text: "Review complete. Your latest evidence is ready."
        });
      } catch (error) {
        if (!controller.signal.aborted) setNotice({
          text: error instanceof Error ? error.message : "Could not refresh progress.",
          error: true
        });
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    }
    timer = setTimeout(poll, 600);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeRunId, refresh]);
  function openClaims(claimIds: string[]) {
    setEvidence({
      sourceIds: [...new Set(snapshot?.claims.filter(claim => claimIds.includes(claim.id)).map(claim => claim.sourceId))],
      claimIds,
      claims: snapshot?.claims ?? []
    });
  }
  function openSource(source: Source) {
    setEvidence({
      sourceIds: [source.id],
      claimIds: [],
      claims: snapshot?.claims ?? []
    });
  }
  async function startRun(recoveryTest = false) {
    setPending(true);
    setNotice(null);
    try {
      const run = await request<Run>("/api/runs", {
        method: "POST",
        body: JSON.stringify({
          mode: recoveryTest ? "recorded" : mode,
          idempotencyKey: crypto.randomUUID(),
          recoveryTest
        })
      });
      setData(current => ({
        ...current,
        runs: [run, ...current.runs.filter(item => item.id !== run.id)]
      }));
      setSelectedRun(run.id);
      if (recoveryTest) setView("Activity");
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "The review could not start.",
        error: true
      });
    } finally {
      setPending(false);
    }
  }
  async function retryRun(run: Run) {
    setPending(true);
    setNotice(null);
    try {
      const retried = await request<Run>(`/api/runs/${run.id}/retry`, {
        method: "POST"
      });
      setData(current => ({
        ...current,
        runs: current.runs.map(item => item.id === retried.id ? retried : item)
      }));
      setNotice({
        text: "Retry queued. Completed steps will be reused."
      });
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "The review could not be retried.",
        error: true
      });
    } finally {
      setPending(false);
    }
  }
  async function ask(text: string) {
    if (!snapshot || text.trim().length < 5 || asking) return;
    const snapshotId = snapshot.id;
    setAskedQuestion(text.trim());
    setAnswer(null);
    setAnswerError(null);
    setAsking(true);
    setAnswerSnapshot(snapshotId);
    try {
      setAnswer(await request<Answer>("/api/questions", {
        method: "POST",
        body: JSON.stringify({
          question: text.trim(),
          snapshotId
        })
      }));
      setQuestion("");
    } catch (error) {
      setAnswerError(error instanceof Error ? error.message : "This question could not be answered.");
    } finally {
      setAsking(false);
    }
  }
  function runButton() {
    return <button className="button secondary" disabled={pending || Boolean(activeRun)} onClick={() => startRun()}>
      {pending || activeRun ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
      {activeRun ? "Reviewing…" : "Run review"}
    </button>;
  }
  function renderReview() {
    if (!snapshot) return <section className="empty-state panel">
      <Layers3 size={28} />
      <h2>Your sources are ready</h2>
      <p>Run a review to compare the evidence with your original decision.</p>
      {runButton()}
    </section>;
    const chartMax = Math.max(25, data.baseline.payingCustomers, ...customerClaims.map(claim => claim.value)) * 1.16;
    const resolved = snapshot.criteria.every(item => item.status === "met");
    return <>
      <section className="review-brief">
        <div className={`brief-icon ${conflict ? "amber" : ""}`}>{conflict ? <CircleAlert size={23} /> : <ShieldCheck size={23} />}</div>
        <div>
          <span className="eyebrow">REVIEW BRIEF</span>
          <h2>{conflict ? "The customer count needs a closer look." : resolved ? "The revisit criteria are supported." : "There’s more to clarify before moving on."}</h2>
          <p>{conflict ? "The latest sources disagree. Compare the evidence before treating the revisit trigger as met." : snapshot.headline}</p>
        </div>
        <span className={`pill ${conflict ? "amber" : "green"}`}>{conflict ? "Needs clarification" : resolved ? "Ready for review" : "Open questions"}</span>
      </section>
      <div className="review-grid">
        <section className="panel traction-panel">
          <div className="section-heading">
            <div>
              <h3>Paying organizations</h3>
              <p>A source-by-source comparison</p>
            </div>
            <span className="pill neutral">{customerClaims[0]?.asOf ? formatDate(customerClaims[0].asOf, true) : "Date unknown"}</span>
          </div>
          <div className="chart" aria-label="Paying organizations compared with the 25-customer revisit threshold">
            <div className="chart-legend">
              <span />
              <span>Revisit trigger: 25</span>
            </div>
            <div className="chart-rows">
              <span className="chart-threshold" style={{
                left: `${25 / chartMax * 100}%`
              }} aria-hidden="true" />
              <button className="chart-row baseline" onClick={() => baselineSource && openSource(baselineSource)} aria-label={`Earlier review: ${data.baseline.payingCustomers} paying organizations. Read source.`}>
                <span className="chart-row-label">Earlier review<span>
                    {baselineSource ? formatDate(baselineSource.effectiveDate, true) : formatDate(data.baseline.date, true)}
                    <ArrowUpRight size={12} />
                  </span></span>
                <span className="chart-track">
                  <span className="chart-fill" style={{
                    width: `${data.baseline.payingCustomers / chartMax * 100}%`
                  }} />
                  <strong style={{
                    left: `${data.baseline.payingCustomers / chartMax * 100}%`
                  }}>{data.baseline.payingCustomers}</strong>
                </span>
              </button>
              {customerClaims.map(claim => <button className={`chart-row ${data.sources.find(source => source.id === claim.sourceId)?.kind === "deck" ? "deck" : "finance"}`} key={claim.id} onClick={() => openClaims([claim.id])} aria-label={`${data.sources.find(source => source.id === claim.sourceId)?.title}: ${claim.value} paying organizations. Read source.`}>
                <span className="chart-row-label">
                  {sourceLabels[data.sources.find(source => source.id === claim.sourceId)?.kind ?? "note"]}
                  <span>
                    {claim.asOf ? formatDate(claim.asOf, true) : "Date unknown"}
                    <ArrowUpRight size={12} />
                  </span>
                </span>
                <span className="chart-track">
                  <span className="chart-fill" style={{
                    width: `${claim.value / chartMax * 100}%`
                  }} />
                  <strong style={{
                    left: `${claim.value / chartMax * 100}%`
                  }}>{claim.value}</strong>
                </span>
              </button>)}
            </div>
          </div>
          <div className="panel-foot">
            <span>{conflict ? "Same date. Same definition. Different counts." : "Open a bar to read its source."}</span>
            <EvidenceLink claimIds={conflict?.claimIds ?? customerClaims.map(claim => claim.id)} onOpen={openClaims} label="Compare passages" />
          </div>
        </section>
        <section className="panel checklist-panel">
          <div className="section-heading">
            <div>
              <h3>Revisit checklist</h3>
              <p>The conditions from our earlier review</p>
            </div>
            <span className="checklist-count">{snapshot.criteria.filter(item => item.status === "met").length}/{snapshot.criteria.length}</span>
          </div>
          {snapshot.criteria.map(criterion => <div className="criterion" key={criterion.id}>
            <span className={`criterion-icon ${criterion.status}`}>{criterion.status === "met" ? <Check size={16} /> : <CircleAlert size={16} />}</span>
            <div>
              <span className={`criterion-state ${criterion.status}`}>{statusLabels[criterion.status]}</span>
              <h4>{criterion.label}</h4>
              <Disclosure className="criterion-detail" title="Why this status?">
                <p>{criterion.explanation}</p>
                <EvidenceLink claimIds={criterion.claimIds} onOpen={openClaims} label="Read evidence" />
              </Disclosure>
            </div>
          </div>)}
          <div className="quiet-note"><ShieldCheck size={14} />Source-backed, not independently verified.</div>
        </section>

        <section className="panel prior-panel">
          <div className="section-heading">
            <h3>Why we tracked it</h3>
            <span className="muted">{formatDate(data.baseline.date, true)}</span>
          </div>
          <p>{data.baseline.rationale}</p>
          <button className="text-button" onClick={() => baselineSource && openSource(baselineSource)}>Read original note<ArrowUpRight size={13} /></button>
        </section>
        <section className="panel next-panel">
          <div className="section-heading"><h3>Next conversation</h3><MessageSquareText size={18} /></div>
          <div>
            <p>Resolve the open questions with a focused, evidence-backed founder conversation.</p>
            <button className="text-button" onClick={() => {
              setView("Questions");
              document.getElementById("tab-2")?.focus();
              void ask(questions[3].text);
            }}>Prepare founder questions<ArrowRight size={14} /></button>
          </div>
        </section>
      </div>
      <Disclosure className="assessment-details" title={<><FileText size={16} />Full assessment</>} detail="Reasoning and additional findings">
        <div className="assessment-body">
          <section className="assessment-summary"><span className="eyebrow">ASSESSMENT</span><p>{snapshot.summary}</p></section>
          <div className="assessment-findings">{snapshot.findings.map(finding => <article key={finding.id}>
            <h3>{finding.title}</h3>
            <p>{finding.detail}</p>
            <EvidenceLink claimIds={finding.claimIds} onOpen={openClaims} />
          </article>)}</div>
        </div>
      </Disclosure>
    </>;
  }
  function renderSources() {
    const filtered = data.sources.filter(source => `${source.title} ${sourceLabels[source.kind]}`.toLowerCase().includes(sourceQuery.toLowerCase()));
    return <>
      <div className="view-heading">
        <div>
          <h2>Source library</h2>
          <p>Open a document to inspect its original text and cited claims.</p>
        </div>
        <button className="button secondary" onClick={() => setAddingSource(true)}><Plus size={16} />Add source</button>
      </div>
      <div className="panel source-library">
        <div className="source-toolbar">
          <span>{data.sources.length} sources <span className="muted">· {snapshot?.claims.length ?? 0} cited claims</span></span>
          <label className="search-input">
            <Search size={16} />
            <input aria-label="Search sources" placeholder="Find a source" value={sourceQuery} onChange={event => setSourceQuery(event.target.value)} />
            {sourceQuery && <button aria-label="Clear source search" onClick={() => setSourceQuery("")}><X size={14} /></button>}
          </label>
        </div>
        {filtered.map(source => <button className="source-row" key={source.id} onClick={() => openSource(source)}>
          <span className={`document-icon ${source.kind}`}><FileText size={21} /></span>
          <span className="source-row-main">
            <strong>{source.title}</strong>
            <span>{sourceLabels[source.kind]} · {formatDate(source.effectiveDate, true)}</span>
          </span>
          <span className={`pill ${snapshot?.sourceIds.includes(source.id) ? "neutral" : "amber"}`}>{snapshot?.sourceIds.includes(source.id) ? "In this review" : source.publisherGroup === "user-provided" ? "Saved for live review" : "Awaiting review"}</span>
          <ChevronRight size={17} />
        </button>)}
        {!filtered.length && <div className="empty-state">
          <Search size={26} />
          <h3>No matching sources</h3>
          <p>Try a different title or document type.</p>
          <button className="button secondary" onClick={() => setSourceQuery("")}>Clear search</button>
        </div>}
      </div>
      <p className="section-note"><Info size={15} />Demo reviews use the four sample documents. Additional sources are saved for live analysis.</p>
    </>;
  }
  function renderQuestions() {
    if (!snapshot) return <section className="panel empty-state">
      <MessageSquareText size={28} />
      <h2>Review the sources first</h2>
      <p>Complete a review to ask questions about its evidence.</p>
      {runButton()}
    </section>;
    return <>
      <div className="view-heading">
        <div>
          <h2>Ask the evidence</h2>
          <p>{snapshot?.mode === "live" ? "Answers use only the sources in this review." : "Explore four prepared questions, each with source citations."}</p>
        </div>
        <span className="pill neutral">{snapshot?.mode === "live" ? "Live analysis" : "Demo questions"}</span>
      </div>
      <div className="question-layout">
        <div className="question-list">{questions.map((item, index) => <button key={item.text} className={askedQuestion === item.text ? "selected" : ""} onClick={() => ask(item.text)} disabled={asking || !snapshot}>
            <span className="question-index">0{index + 1}</span>
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            <ArrowRight size={16} />
          </button>)}</div>
        <section className="panel answer-panel" aria-live="polite" aria-busy={asking}>
          {!askedQuestion ? <div className="empty-state">
            <MessageSquareText size={28} />
            <h3>Start with a question</h3>
            <p>Choose a topic to see a concise answer and the evidence behind it.</p>
          </div> : <>
            <span className="eyebrow">YOUR QUESTION</span>
            <h3>{askedQuestion}</h3>
            {asking && <div className="answer-loading"><LoaderCircle size={19} className="spin" />Reading the evidence…</div>}
            {answerError && <div className="inline-error" role="alert">
              <CircleAlert size={17} />
              <p>{answerError}</p>
              <button className="text-button" onClick={() => ask(askedQuestion)}>Try again</button>
            </div>}
            {answer && <div className="answer-content">
              {answerSnapshot !== snapshot?.id && <div className="snapshot-warning">A newer review is available. <button className="text-button" onClick={() => ask(askedQuestion)}>Update this answer</button></div>}
              {answer.paragraphs.map((paragraph, index) => <div className="answer-paragraph" key={index}>
                <p>{paragraph.text}</p>
                {answerSnapshot === snapshot?.id && <EvidenceLink claimIds={paragraph.claimIds} onOpen={openClaims} label="Supporting passages" />}
              </div>)}
              {answer.unknowns.length > 0 && <div className="answer-unknowns">
                <h4>Still to clarify</h4>
                <ul>{answer.unknowns.map(item => <li key={item}>{item}</li>)}</ul>
              </div>}
              <div className="answer-provenance"><ShieldCheck size={14} />{answer.retrievedSourceIds.length} supporting sources · {answer.mode === "recorded" ? "Prepared demo response" : "Live response"}</div>
            </div>}
          </>}
          {snapshot?.mode === "live" && <form className="question-form" onSubmit={event => {
            event.preventDefault();
            void ask(question);
          }}>
            <label htmlFor="custom-question">Your question</label>
            <div>
              <input id="custom-question" placeholder="Ask about this company’s evidence…" value={question} onChange={event => setQuestion(event.target.value)} disabled={asking} minLength={5} maxLength={1000} required />
              <button className="button primary" aria-label="Ask question" disabled={asking || question.trim().length < 5}><ArrowRight size={17} /></button>
            </div>
          </form>}
        </section>
      </div>
      {snapshot?.mode !== "live" && <p className="section-note"><Info size={15} />Free-form questions are available after a live review. These prepared questions work without an API key.</p>}
    </>;
  }
  function renderDecisions() {
    return <>
      <div className="view-heading"><div>
          <h2>Decision history</h2>
          <p>Each decision keeps the evidence you reviewed at the time.</p>
        </div></div>
      <div className="decision-timeline">
        {decisions.map((decision, index) => <article className="panel decision-entry" key={decision.id}>
          <span className="timeline-node"><Check size={14} /></span>
          <div className="decision-entry-header">
            <span className="pill green">{actions[decision.action].past}</span>
            <time dateTime={decision.createdAt}>
              {formatDate(decision.createdAt)}
              {index === 0 && <span className="latest-label">Latest</span>}
            </time>
          </div>
          <p className="decision-rationale">{decision.rationale}</p>
          <div className="decision-entry-footer">
            <span><Layers3 size={14} />{decision.snapshotId === snapshot?.id ? "Current review" : "Earlier review"} · {decision.snapshotId.slice(0, 8)}</span>
            <a className="text-button" href={`/api/decisions/${decision.id}/export`} download><ArrowDownToLine size={14} />Download decision</a>
          </div>
        </article>)}
        <article className="panel decision-entry original">
          <span className="timeline-node"><Clock3 size={14} /></span>
          <div className="decision-entry-header">
            <span className="pill neutral">Original decision · Track</span>
            <time dateTime={data.baseline.date}>{formatDate(data.baseline.date)}</time>
          </div>
          <p className="decision-rationale">{data.baseline.rationale}</p>
          <div className="original-trigger">
            <span className="eyebrow">REVISIT WHEN</span>
            <p>{data.baseline.trigger}</p>
          </div>
          <button className="text-button" onClick={() => baselineSource && openSource(baselineSource)}>Read analyst note<ArrowUpRight size={13} /></button>
        </article>
      </div>
      <p className="section-note"><ArrowDownToLine size={15} />Downloads contain the decision and evidence as JSON. Nothing is sent externally.</p>
    </>;
  }
  function renderActivity() {
    return <>
      <div className="view-heading">
        <div>
          <h2>Review activity</h2>
          <p>Follow the review, inspect each step, and recover from a failed attempt.</p>
        </div>
        {data.liveAvailable && <label className="mode-picker">Execution<select value={mode} onChange={event => setMode(event.target.value as Mode)} disabled={Boolean(activeRun)} aria-label="Review execution mode">
            <option value="recorded">Demo</option>
            <option value="live">Live</option>
          </select></label>}
      </div>
      {displayedRun ? <div className="activity-layout">
        <div className="run-list" aria-label="Review runs">{runs.map((run, index) => <button key={run.id} className={displayedRun.id === run.id ? "selected" : ""} onClick={() => setSelectedRun(run.id)}>
            <span className={`run-dot ${run.status}`} />
            <span>
              <strong>
                {run.recoveryTest ? "Recovery test" : "Company review"}
                {index === 0 && <small>Latest</small>}
              </strong>
              <small>{formatDate(run.createdAt, true)} · {new Date(run.createdAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "UTC"
                })} UTC</small>
            </span>
            <ChevronRight size={14} />
          </button>)}</div>
        <article className="panel run-card">
          <div className="run-card-heading">
            <div>
              <h3>{displayedRun.recoveryTest ? "Recovery test" : "Company review"}</h3>
              <span className="muted">{displayedRun.mode === "recorded" ? "Demo sources · No model call" : "Live analysis"}</span>
            </div>
            <span className={`pill ${displayedRun.status === "completed" ? "green" : displayedRun.status === "failed" ? "red" : "neutral"}`}>
              {busyStatuses.has(displayedRun.status) && <LoaderCircle className="spin" size={13} />}
              {displayedRun.status}
            </span>
          </div>
          <div className="run-stage-list">{STAGES.map((stage, index) => {
              const attempts = displayedRun.executions.filter(item => item.stage === stage);
              const execution = attempts.at(-1);
              return <div key={stage} className={`run-stage ${execution?.status ?? "waiting"}`}>
                <span className="stage-node">{execution?.status === "completed" ? <Check size={14} /> : execution?.status === "running" ? <LoaderCircle size={14} className="spin" /> : execution?.status === "failed" ? <X size={14} /> : index + 1}</span>
                <div className="stage-info">
                  <strong>{stageLabels[stage]}</strong>
                  {execution?.error && <p>{execution.error}</p>}
                  {attempts.length > 1 && <details className="attempt-history">
                    <summary>{attempts.length} attempts</summary>
                    {attempts.map(attempt => <p key={attempt.attempt}>Attempt {attempt.attempt}: {attempt.status}{attempt.error ? ` — ${attempt.error}` : ""}</p>)}
                  </details>}
                </div>
                <span className="stage-detail">
                  {execution?.durationMs != null ? `${execution.durationMs} ms` : execution?.status === "running" ? "In progress" : "Waiting"}
                  {execution?.model && <small>
                    {execution.model}
                    {execution.tokens != null ? ` · ${execution.tokens} tokens` : ""}
                  </small>}
                </span>
              </div>;
            })}</div>
          {displayedRun.error && <div className="run-error">
            <CircleAlert size={17} />
            <p>{displayedRun.error}</p>
            {displayedRun.status === "failed" && <button className="button secondary" disabled={pending || Boolean(activeRun)} onClick={() => retryRun(displayedRun)}>Retry review</button>}
          </div>}
          <div className="panel-foot">
            <span>{displayedRun.status === "completed" ? "Review saved successfully" : displayedRun.status === "failed" ? "Previous review preserved" : "Completed steps are saved"}</span>
            <code>{displayedRun.id.slice(0, 8)}</code>
          </div>
        </article>
      </div> : <section className="panel empty-state">
        <Workflow size={27} />
        <h3>No reviews yet</h3>
        {runButton()}
      </section>}
      <details className="recovery-details">
        <summary>
          <span><Workflow size={16} />Developer tools</span>
          <ChevronRight size={16} />
        </summary>
        <div className="recovery-test">
          <div>
            <h3>Test automatic recovery</h3>
            <p>Interrupt the first extraction attempt. The queue retries and reuses completed steps.</p>
          </div>
          <button className="button secondary" disabled={pending || Boolean(activeRun)} onClick={() => startRun(true)}><RefreshCw size={15} />Test recovery</button>
        </div>
      </details>
    </>;
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to company review</a>
    <header className="app-header"><div className="app-header-inner">
        <button className="brand" onClick={() => setView("Review")} aria-label="Revisit home"><span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>revisit<span className="brand-period">.</span></button>
        <button className="demo-button" onClick={() => setAbout(true)}><span />Demo workspace<Info size={14} /></button>
      </div></header>
    <main id="main-content" className="page-content">
      <div className="breadcrumb">Watchlist<ChevronRight size={13} />Company review</div>
      <header className="company-header">
        <div className="company-heading">
          <div className="company-monogram" aria-hidden="true">LH</div>
          <div>
            <div className="company-title">
              <h1>{data.company.name}</h1>
              <span className="pill neutral">{data.company.stage}</span>
            </div>
            <p>
              {data.company.sector}
              <span>·</span>
              {data.company.location}
            </p>
          </div>
        </div>
        <div className="company-actions">
          {runButton()}
          <button className="button primary" onClick={() => setReviewing(snapshot?.id ?? null)} disabled={!snapshot}><CheckCheck size={16} />Record decision</button>
        </div>
      </header>
      <p className="company-description">{data.company.description}</p>
      <div className="tabs-row">
        <div className="view-tabs" role="tablist" aria-label="Company review views">{views.map((item, index) => <button key={item} id={`tab-${index}`} role="tab" aria-selected={view === item} aria-controls="review-panel" tabIndex={view === item ? 0 : -1} onClick={() => setView(item)} onKeyDown={event => {
            if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + views.length) % views.length;
              setView(views[next]);
              document.getElementById(`tab-${next}`)?.focus();
            }
          }}>
            {item}
            {item === "Sources" && <span>{data.sources.length}</span>}
            {item === "Decisions" && decisions.length > 0 && <span>{decisions.length}</span>}
            {item === "Activity" && activeRun && <span className="activity-dot" />}
          </button>)}</div>
        <span className="review-date">{snapshot ? <>Updated {formatDate(snapshot.createdAt, true)}</> : "Ready to review"}</span>
      </div>
      {!activeRun && latestRun?.status === "failed" && view !== "Activity" && <div className="notice error" role="alert">
        <CircleAlert size={17} />
        <p>The latest review failed. Your previous evidence is still available.</p>
        <button className="text-button" onClick={() => {
          setSelectedRun(latestRun.id);
          setView("Activity");
        }}>View error<ArrowRight size={14} /></button>
      </div>}
      <div id="review-panel" role="tabpanel" aria-labelledby={`tab-${views.indexOf(view)}`} tabIndex={0}>{view === "Review" ? renderReview() : view === "Sources" ? renderSources() : view === "Questions" ? renderQuestions() : view === "Decisions" ? renderDecisions() : renderActivity()}</div>
      <footer className="page-footer">
        <span><ShieldCheck size={14} />Fictional company · {snapshot?.mode === "live" ? "Live analysis" : "Prepared demo data"}</span>
        <button className="text-button" onClick={() => setAbout(true)}>How this demo works<ArrowUpRight size={13} /></button>
      </footer>
    </main>
    <div className="feedback-stack">
      {activeRun && <div className="progress-banner" role="status">
        <LoaderCircle className="spin" size={18} />
        <div>
          <strong>{activeRun.status === "queued" ? "Review queued" : activeRun.status === "retrying" ? "Retrying the review" : "Review in progress"}</strong>
          <span>{[...activeRun.executions].reverse().find(step => step.status === "running") ? stageLabels[[...activeRun.executions].reverse().find(step => step.status === "running")!.stage] : "Waiting for the worker"} · Your previous review stays available.</span>
        </div>
        <button className="text-button" onClick={() => {
          setSelectedRun(activeRun.id);
          setView("Activity");
        }}>View progress<ArrowRight size={14} /></button>
      </div>}
      <Toast notice={notice} onDismiss={dismissNotice} />
    </div>
    {evidence && <EvidenceDrawer sources={data.sources.filter(source => evidence.sourceIds.includes(source.id))} claims={evidence.claims} selectedClaimIds={evidence.claimIds} onClose={() => setEvidence(null)} />}
    {reviewing && <ReviewDialog snapshotId={reviewing} stale={reviewing !== snapshot?.id} onClose={() => setReviewing(null)} onSave={async decision => {
      setData(current => ({
        ...current,
        decisions: [decision, ...current.decisions.filter(item => item.id !== decision.id)]
      }));
      setReviewing(null);
      setNotice({
        text: "Decision saved with its original evidence."
      });
      setView("Decisions");
    }} />}
    {addingSource && <SourceDialog liveAvailable={data.liveAvailable} onClose={() => setAddingSource(false)} onSave={async () => {
      await refresh();
      setAddingSource(false);
      setView("Sources");
      setNotice({
        text: "Source saved for live analysis. Demo reviews continue to use the four sample documents."
      });
    }} />}
    {about && <Dialog title="A small, complete review workflow." eyebrow="ABOUT THIS DEMO" onClose={() => setAbout(false)}><div className="about-content">
        <p>Compare new evidence with an earlier investment decision, inspect disagreements, and record your next step.</p>
        <div className="about-fact">
          <FileText size={20} />
          <div>
            <h3>Fictional company, prepared sources</h3>
            <p>The four sample documents and suggested answers work without an API key. Demo reviews use these sources only.</p>
          </div>
        </div>
        <div className="about-fact">
          <Workflow size={20} />
          <div>
            <h3>Real processing and persistence</h3>
            <p>Reviews, citations, retries, and decisions are stored in PostgreSQL. Activity shows the actual processing steps.</p>
          </div>
        </div>
        <div className="about-fact">
          <MessageSquareText size={20} />
          <div>
            <h3>Custom analysis needs live mode</h3>
            <p>{data.liveAvailable ? "Live mode is connected. Select it in Activity before running a review with custom sources." : "Live mode is not connected. Additional sources can be saved for later; free-form questions become available after a live review."}</p>
          </div>
        </div>
        <p className="muted">Downloads are local JSON files. Nothing is sent to a founder or CRM.</p>
      </div></Dialog>}
  </div>;
}
function ReviewDialog({
  snapshotId,
  stale,
  onClose,
  onSave
}: {
  snapshotId: string;
  stale: boolean;
  onClose: () => void;
  onSave: (decision: Decision) => Promise<void>;
}) {
  const [action, setAction] = useState<DecisionAction>("clarify");
  const [rationale, setRationale] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const decision = await request<Decision>("/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          snapshotId,
          action,
          rationale: rationale.trim(),
          idempotencyKey: key.current
        })
      });
      await onSave(decision);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The decision could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  return <Dialog title="Record your decision" eyebrow="NEXT STEP" onClose={onClose}>
    <form onSubmit={submit} className="review-form">
      <p className="dialog-description">Save a next step and the reason for it. This review keeps its original evidence.</p>
      {stale && <p className="snapshot-warning">A newer snapshot is available. This decision will remain attached to the snapshot you opened.</p>}
      <fieldset className="decision-options">
        <legend className="field-label">Choose the next step</legend>
        {(Object.entries(actions) as [DecisionAction, typeof actions[DecisionAction]][]).map(([value, item]) => <label key={value} className={action === value ? "selected" : ""}>
          <input type="radio" name="decision" value={value} checked={action === value} onChange={() => setAction(value)} />
          <span>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </span>
          {action === value && <Check size={16} />}
        </label>)}
      </fieldset>
      <label className="form-field">
        <span className="field-label">Rationale</span>
        <textarea required minLength={10} maxLength={2000} rows={4} placeholder="What matters, what remains open, and what should happen next?" value={rationale} onChange={event => setRationale(event.target.value)} />
      </label>
      <div className="form-context">
        <Layers3 size={14} />Evidence snapshot {snapshotId.slice(0, 8)}<span>Immutable once saved</span>
      </div>
      {error && <div className="inline-error" role="alert">
        <CircleAlert size={16} />
        <p>{error}</p>
      </div>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="button primary" disabled={saving || rationale.trim().length < 10}>
          {saving ? <LoaderCircle className="spin" size={15} /> : <CheckCheck size={15} />}
          {saving ? "Saving decision…" : "Save decision"}
        </button>
      </div>
    </form>
  </Dialog>;
}
function SourceDialog({
  liveAvailable,
  onClose,
  onSave
}: {
  liveAvailable: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await request<Source>("/api/sources", {
        method: "POST",
        body: JSON.stringify({
          title: fields.get("title"),
          kind: fields.get("kind"),
          body: fields.get("body"),
          effectiveDate: fields.get("effectiveDate")
        })
      });
      await onSave();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The source could not be preserved.");
    } finally {
      setSaving(false);
    }
  }
  return <Dialog title="Add a source" eyebrow="ADD A SOURCE" onClose={onClose}>
    <form className="source-form" onSubmit={submit}>
      <p className="dialog-description">Paste the original text. It will be saved in your source library.</p>
      <div className="intake-note">
        <CircleAlert size={16} />
        <p>{liveAvailable ? "This source will be included in your next live review. Demo reviews use only the four sample sources." : "Save for later: custom sources are excluded from demo reviews. Analysis requires live mode, which is not connected."}</p>
      </div>
      <label className="form-field">
        <span className="field-label">Source title</span>
        <input name="title" required minLength={3} maxLength={120} placeholder="e.g. Founder update · July 2026" />
      </label>
      <div className="form-two-columns">
        <label className="form-field">
          <span className="field-label">Document type</span>
          <select name="kind" defaultValue="note">{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <label className="form-field">
          <span className="field-label">Effective date</span>
          <input name="effectiveDate" type="date" required />
        </label>
      </div>
      <label className="form-field">
        <span className="field-label">Original source text</span>
        <textarea name="body" required minLength={20} maxLength={20000} rows={7} placeholder="Paste the relevant document text…" />
      </label>
      {error && <div className="inline-error" role="alert">
        <CircleAlert size={16} />
        <p>{error}</p>
      </div>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="button primary" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={15} /> : <FilePlus2 size={15} />}
          {saving ? "Saving source…" : "Save source"}
        </button>
      </div>
    </form>
  </Dialog>;
}
