"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, FilePlus2, LoaderCircle } from "lucide-react";
import type { Source } from "@/domain/types";
import Dialog from "./dialog";
import { sourceLabels } from "./evidence-drawer";
import { request } from "./workspace-api";

export default function SourceDialog({
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
        <p>{liveAvailable ? "This source will be included in your next live review. Demo reviews use only the four sample sources." : "Save for later: custom sources are excluded from demo reviews. Analysis requires live mode, which is not configured."}</p>
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
