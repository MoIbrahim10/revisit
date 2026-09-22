"use client";

import { ArrowDownToLine, ArrowUpRight, Check, Clock3, Layers3 } from "lucide-react";
import type { Baseline, Decision, Source } from "@/domain/types";
import { formatDate } from "./evidence-drawer";
import { actions } from "./workspace-content";

export default function DecisionHistory({ decisions, baseline, sources, snapshotId, onOpenSource }: {
  decisions: Decision[];
  baseline: Baseline;
  sources: Source[];
  snapshotId: string | undefined;
  onOpenSource: (source: Source) => void;
}) {
  const baselineSource = sources.find(source => source.id === baseline.sourceId);
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
          <span><Layers3 size={14} />{decision.snapshotId === snapshotId ? "Current review" : "Earlier review"} · {decision.snapshotId.slice(0, 8)}</span>
          <a className="text-button" href={`/api/decisions/${decision.id}/export`} download><ArrowDownToLine size={14} />Download decision</a>
        </div>
      </article>)}
      <article className="panel decision-entry original">
        <span className="timeline-node"><Clock3 size={14} /></span>
        <div className="decision-entry-header">
          <span className="pill neutral">Original decision · Track</span>
          <time dateTime={baseline.date}>{formatDate(baseline.date)}</time>
        </div>
        <p className="decision-rationale">{baseline.rationale}</p>
        <div className="original-trigger">
          <span className="eyebrow">REVISIT WHEN</span>
          <p>{baseline.trigger}</p>
        </div>
        <button className="text-button" onClick={() => baselineSource && onOpenSource(baselineSource)}>Read analyst note<ArrowUpRight size={13} /></button>
      </article>
    </div>
    <p className="section-note"><ArrowDownToLine size={15} />Downloads contain the decision and evidence as JSON. Nothing is sent externally.</p>
  </>;
}
