"use client";

import type { ReactNode } from "react";
import { Check, ChevronRight, CircleAlert, LoaderCircle, RefreshCw, Workflow, X } from "lucide-react";
import { STAGES, type Run } from "@/domain/types";
import { formatDate } from "./evidence-drawer";
import { busyStatuses, stageLabels } from "./workspace-content";

export default function ActivityView({ runs, selectedRunId, pending, activeRun, runControl, onSelectRun, onRetry, onTestRecovery }: {
  runs: Run[];
  selectedRunId: string | null;
  pending: boolean;
  activeRun: Run | undefined;
  runControl: ReactNode;
  onSelectRun: (id: string) => void;
  onRetry: (run: Run) => void;
  onTestRecovery: () => void;
}) {
  const displayedRun = runs.find(run => run.id === selectedRunId) ?? runs[0];
  return <>
    <div className="view-heading">
      <div>
        <h2>Review activity</h2>
        <p>Follow the review, inspect each step, and recover from a failed attempt.</p>
      </div>
    </div>
    {displayedRun ? <div className="activity-layout">
      <div className="run-list" aria-label="Review runs">{runs.map((run, index) => <button key={run.id} className={displayedRun.id === run.id ? "selected" : ""} onClick={() => onSelectRun(run.id)}>
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
          {displayedRun.status === "failed" && <button className="button secondary" disabled={pending || Boolean(activeRun)} onClick={() => onRetry(displayedRun)}>Retry review</button>}
        </div>}
        <div className="panel-foot">
          <span>{displayedRun.status === "completed" ? "Review saved successfully" : displayedRun.status === "failed" ? "Previous review preserved" : "Completed steps are saved"}</span>
          <code>{displayedRun.id.slice(0, 8)}</code>
        </div>
      </article>
    </div> : <section className="panel empty-state">
      <Workflow size={27} />
      <h3>No reviews yet</h3>
      {runControl}
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
        <button className="button secondary" disabled={pending || Boolean(activeRun)} onClick={() => onTestRecovery()}><RefreshCw size={15} />Test recovery</button>
      </div>
    </details>
  </>;
}
