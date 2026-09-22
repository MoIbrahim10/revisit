"use client";

import { ChevronRight, FileText, Info, Plus, Search, X } from "lucide-react";
import type { Snapshot, Source } from "@/domain/types";
import { formatDate, sourceLabels } from "./evidence-drawer";

export default function SourceLibrary({ sources, snapshot, query, onQueryChange, onOpenSource, onAddSource }: {
  sources: Source[];
  snapshot: Snapshot | null;
  query: string;
  onQueryChange: (query: string) => void;
  onOpenSource: (source: Source) => void;
  onAddSource: () => void;
}) {
  const filtered = sources.filter(source => `${source.title} ${sourceLabels[source.kind]}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="view-heading">
      <div>
        <h2>Source library</h2>
        <p>Open a document to inspect its original text and cited claims.</p>
      </div>
      <button className="button secondary" onClick={() => onAddSource()}><Plus size={16} />Add source</button>
    </div>
    <div className="panel source-library">
      <div className="source-toolbar">
        <span>{sources.length} sources <span className="muted">· {snapshot?.claims.length ?? 0} cited claims</span></span>
        <label className="search-input">
          <Search size={16} />
          <input aria-label="Search sources" placeholder="Find a source" value={query} onChange={event => onQueryChange(event.target.value)} />
          {query && <button aria-label="Clear source search" onClick={() => onQueryChange("")}><X size={14} /></button>}
        </label>
      </div>
      {filtered.map(source => <button className="source-row" key={source.id} onClick={() => onOpenSource(source)}>
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
        <button className="button secondary" onClick={() => onQueryChange("")}>Clear search</button>
      </div>}
    </div>
    <p className="section-note"><Info size={15} />Demo reviews use the four sample documents. Additional sources are saved for live analysis.</p>
  </>;
}
