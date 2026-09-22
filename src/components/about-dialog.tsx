"use client";

import { FileText, MessageSquareText, Workflow } from "lucide-react";
import Dialog from "./dialog";

export default function AboutDialog({ liveAvailable, onClose }: {
  liveAvailable: boolean;
  onClose: () => void;
}) {
  return <Dialog title="A small, complete review workflow." eyebrow="ABOUT THIS DEMO" onClose={onClose}><div className="about-content">
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
            <p>{liveAvailable ? "Live mode is configured. Model output is evidence-checked, and Activity shows when grounded analysis replaced an invalid or unavailable response." : "Live mode is not configured. Additional sources can be saved for later; free-form questions become available after a live review."}</p>
          </div>
        </div>
        <p className="muted">Downloads are local JSON files. Nothing is sent to a founder or CRM.</p>
      </div></Dialog>;
}
