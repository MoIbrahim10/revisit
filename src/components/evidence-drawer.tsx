"use client";

import { CalendarDays, FileText, Link2, Quote, ShieldCheck } from "lucide-react";
import type { Claim, Source } from "@/domain/types";
import Dialog from "./dialog";
export function formatDate(value: string, short = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
    timeZone: "UTC"
  });
}
export const sourceLabels: Record<Source["kind"], string> = {
  note: "Analyst note",
  deck: "Founder deck",
  financial: "Finance extract",
  website: "Website capture"
};
function HighlightedBody({
  source,
  claims
}: {
  source: Source;
  claims: Claim[];
}) {
  const ranges = claims.filter(claim => claim.start >= 0 && claim.end <= source.body.length && source.body.slice(claim.start, claim.end) === claim.quote).sort((a, b) => a.start - b.start);
  let cursor = 0;
  const parts = [];
  for (const claim of ranges) {
    if (claim.start < cursor) continue;
    parts.push(source.body.slice(cursor, claim.start));
    parts.push(<mark key={claim.id}>{source.body.slice(claim.start, claim.end)}</mark>);
    cursor = claim.end;
  }
  parts.push(source.body.slice(cursor));
  return <div className="source-body">{parts}</div>;
}
export default function EvidenceDrawer({
  sources,
  claims,
  selectedClaimIds,
  onClose
}: {
  sources: Source[];
  claims: Claim[];
  selectedClaimIds: string[];
  onClose: () => void;
}) {
  const selectedClaims = selectedClaimIds.length ? claims.filter(claim => selectedClaimIds.includes(claim.id)) : claims;
  return <Dialog title={sources.length > 1 ? "Compare the source passages" : "Source details"} eyebrow="EVIDENCE" drawer onClose={onClose}>
    <div className="drawer-intro">
      <ShieldCheck size={17} />
      <p>Original source text. Company statements have not been independently verified.</p>
    </div>
    {sources.map((source, index) => {
      const sourceClaims = selectedClaims.filter(claim => claim.sourceId === source.id);
      return <section className="source-document" key={source.id}>
        <div className="source-document-top">
          <span className="source-number">{String(index + 1).padStart(2, "0")}</span>
          <span className="eyebrow">{sourceLabels[source.kind]}</span>
        </div>
        <h3>{source.title}</h3>
        <dl className="source-metadata">
          <div>
            <dt>
              <CalendarDays size={13} /> Effective</dt>
            <dd>{formatDate(source.effectiveDate)}</dd>
          </div>
          <div>
            <dt>
              <FileText size={13} /> Captured</dt>
            <dd>{formatDate(source.capturedAt)}</dd>
          </div>
          <div>
            <dt>
              <Link2 size={13} /> Publisher</dt>
            <dd>{source.publisherGroup}</dd>
          </div>
        </dl>
        {sourceClaims.length > 0 && <div className="exact-quotes">{sourceClaims.map(claim => <div key={claim.id} className="exact-quote">
          <Quote size={15} />
            <blockquote>{claim.quote}</blockquote>
            <span className="quote-location">{source.locator} · characters {claim.start}–{claim.end}</span>
        </div>)}</div>}
        <details className="full-source" open={sourceClaims.length === 0}>
          <summary>Read full source <span>{source.body.length.toLocaleString()} characters</span>
          </summary>
          <HighlightedBody source={source} claims={sourceClaims} />
        </details>
      </section>;
    })}
    {sources.length === 0 && <p className="muted">No source is available for this selection.</p>}
    {sources.length > 1 && new Set(sources.map(source => source.publisherGroup)).size === 1 && <div className="independence-note">
      <Link2 size={16} />
      <p>These documents share a publisher. Multiple documents are not independent corroboration.</p>
    </div>}
  </Dialog>;
}
