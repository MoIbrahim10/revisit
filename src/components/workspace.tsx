"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CheckCheck, ChevronRight, CircleAlert, Info, LoaderCircle, ShieldCheck } from "lucide-react";
import type { Mode, Run, Source, WorkspaceData } from "@/domain/types";
import AboutDialog from "./about-dialog";
import ActivityView from "./activity-view";
import DecisionHistory from "./decision-history";
import EvidenceDrawer, { formatDate } from "./evidence-drawer";
import QuestionsView from "./questions-view";
import { RunReviewButton } from "./review-controls";
import ReviewDialog from "./review-dialog";
import ReviewView from "./review-view";
import SourceDialog from "./source-dialog";
import SourceLibrary from "./source-library";
import Toast from "./toast";
import { useEvidenceQuestion } from "./use-evidence-question";
import { request } from "./workspace-api";
import { busyStatuses, questions, stageLabels, views } from "./workspace-content";
import type { EvidenceSelection, WorkspaceNotice, WorkspaceView } from "./workspace-types";

export default function Workspace({
  initialData
}: {
  initialData: WorkspaceData;
}) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<WorkspaceView>("Review");
  const [mode, setMode] = useState<Mode>("recorded");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<WorkspaceNotice | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const [evidence, setEvidence] = useState<EvidenceSelection | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [about, setAbout] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const snapshot = data.snapshot;
  const evidenceQuestion = useEvidenceQuestion(snapshot);
  const runs = [...data.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latestRun = runs[0];
  const activeRun = runs.find(run => busyStatuses.has(run.status));
  const activeRunId = activeRun?.id;
  const decisions = [...data.decisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  const runControl = <RunReviewButton pending={pending} activeRun={activeRun} onRun={() => startRun()} />;

  function prepareFounderQuestions() {
    setView("Questions");
    document.getElementById("tab-2")?.focus();
    void evidenceQuestion.ask(questions[3].text);
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
          {data.liveAvailable && <label className="mode-picker">Review mode<select value={mode} onChange={event => setMode(event.target.value as Mode)} disabled={pending || Boolean(activeRun)} aria-label="Review mode">
            <option value="recorded">Demo</option>
            <option value="live">Live</option>
          </select></label>}
          {runControl}
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
      <div id="review-panel" role="tabpanel" aria-labelledby={`tab-${views.indexOf(view)}`} tabIndex={0}>
        {view === "Review" && <ReviewView snapshot={snapshot} baseline={data.baseline} sources={data.sources} runControl={runControl} onOpenClaims={openClaims} onOpenSource={openSource} onPrepareQuestions={prepareFounderQuestions} />}
        {view === "Sources" && <SourceLibrary sources={data.sources} snapshot={snapshot} query={sourceQuery} onQueryChange={setSourceQuery} onOpenSource={openSource} onAddSource={() => setAddingSource(true)} />}
        {view === "Questions" && <QuestionsView snapshot={snapshot} state={evidenceQuestion.state} runControl={runControl} onQuestionChange={evidenceQuestion.setQuestion} onAsk={evidenceQuestion.ask} onOpenClaims={openClaims} />}
        {view === "Decisions" && <DecisionHistory decisions={decisions} baseline={data.baseline} sources={data.sources} snapshotId={snapshot?.id} onOpenSource={openSource} />}
        {view === "Activity" && <ActivityView runs={runs} selectedRunId={selectedRun} pending={pending} activeRun={activeRun} runControl={runControl} onSelectRun={setSelectedRun} onRetry={retryRun} onTestRecovery={() => startRun(true)} />}
      </div>
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
    {about && <AboutDialog liveAvailable={data.liveAvailable} onClose={() => setAbout(false)} />}
  </div>;
}
