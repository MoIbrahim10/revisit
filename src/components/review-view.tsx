"use client";

import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, FileText, Layers3, MessageSquareText, ShieldCheck } from "lucide-react";
import type { Baseline, Snapshot, Source } from "@/domain/types";
import Disclosure from "./disclosure";
import { formatDate, sourceLabels } from "./evidence-drawer";
import { EvidenceLink } from "./review-controls";
import { statusLabels } from "./workspace-content";

export default function ReviewView({ snapshot, baseline, sources, runControl, onOpenClaims, onOpenSource, onPrepareQuestions }: {
  snapshot: Snapshot | null;
  baseline: Baseline;
  sources: Source[];
  runControl: ReactNode;
  onOpenClaims: (ids: string[]) => void;
  onOpenSource: (source: Source) => void;
  onPrepareQuestions: () => void;
}) {
  const customerCriterion = snapshot?.criteria.find(item => item.id === "paying-customers");
  const conflict = snapshot?.findings.find(finding => finding.kind === "conflict" && customerCriterion?.status === "disputed" && finding.claimIds.every(id => customerCriterion.claimIds.includes(id)));
  const customerClaims = snapshot?.claims.filter(claim => customerCriterion?.claimIds.includes(claim.id)) ?? [];
  const baselineSource = sources.find(source => source.id === baseline.sourceId);
  if (!snapshot) return <section className="empty-state panel">
    <Layers3 size={28} />
    <h2>Your sources are ready</h2>
    <p>Run a review to compare the evidence with your original decision.</p>
    {runControl}
  </section>;
  const chartMax = Math.max(25, baseline.payingCustomers, ...customerClaims.map(claim => claim.value)) * 1.16;
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
            <button className="chart-row baseline" onClick={() => baselineSource && onOpenSource(baselineSource)} aria-label={`Earlier review: ${baseline.payingCustomers} paying organizations. Read source.`}>
              <span className="chart-row-label">Earlier review<span>
                  {baselineSource ? formatDate(baselineSource.effectiveDate, true) : formatDate(baseline.date, true)}
                  <ArrowUpRight size={12} />
                </span></span>
              <span className="chart-track">
                <span className="chart-fill" style={{
                  width: `${baseline.payingCustomers / chartMax * 100}%`
                }} />
                <strong style={{
                  left: `${baseline.payingCustomers / chartMax * 100}%`
                }}>{baseline.payingCustomers}</strong>
              </span>
            </button>
            {customerClaims.map(claim => <button className={`chart-row ${sources.find(source => source.id === claim.sourceId)?.kind === "deck" ? "deck" : "finance"}`} key={claim.id} onClick={() => onOpenClaims([claim.id])} aria-label={`${sources.find(source => source.id === claim.sourceId)?.title}: ${claim.value} paying organizations. Read source.`}>
              <span className="chart-row-label">
                {sourceLabels[sources.find(source => source.id === claim.sourceId)?.kind ?? "note"]}
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
          <EvidenceLink claimIds={conflict?.claimIds ?? customerClaims.map(claim => claim.id)} onOpen={onOpenClaims} label="Compare passages" />
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
              <EvidenceLink claimIds={criterion.claimIds} onOpen={onOpenClaims} label="Read evidence" />
            </Disclosure>
          </div>
        </div>)}
        <div className="quiet-note"><ShieldCheck size={14} />Source-backed, not independently verified.</div>
      </section>

      <section className="panel prior-panel">
        <div className="section-heading">
          <h3>Why we tracked it</h3>
          <span className="muted">{formatDate(baseline.date, true)}</span>
        </div>
        <p>{baseline.rationale}</p>
        <button className="text-button" onClick={() => baselineSource && onOpenSource(baselineSource)}>Read original note<ArrowUpRight size={13} /></button>
      </section>
      <section className="panel next-panel">
        <div className="section-heading"><h3>Next conversation</h3><MessageSquareText size={18} /></div>
        <div>
          <p>Resolve the open questions with a focused, evidence-backed founder conversation.</p>
          <button className="text-button" onClick={onPrepareQuestions}>Prepare founder questions<ArrowRight size={14} /></button>
        </div>
      </section>
    </div>
    <Disclosure className="assessment-details" title={<><FileText size={16} />Full assessment</>} detail="Reasoning and additional findings">
      <div className="assessment-body">
        <section className="assessment-summary"><span className="eyebrow">ASSESSMENT</span><p>{snapshot.summary}</p></section>
        <div className="assessment-findings">{snapshot.findings.map(finding => <article key={finding.id}>
          <h3>{finding.title}</h3>
          <p>{finding.detail}</p>
          <EvidenceLink claimIds={finding.claimIds} onOpen={onOpenClaims} />
        </article>)}</div>
      </div>
    </Disclosure>
  </>;
}
