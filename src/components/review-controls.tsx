"use client";

import { ArrowUpRight, Link2, LoaderCircle, RefreshCw } from "lucide-react";
import type { Run } from "@/domain/types";

export function EvidenceLink({ claimIds, onOpen, label = "View evidence" }: {
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

export function RunReviewButton({ pending, activeRun, onRun }: {
  pending: boolean;
  activeRun: Run | undefined;
  onRun: () => void;
}) {
  return <button className="button secondary" disabled={pending || Boolean(activeRun)} onClick={onRun}>
    {pending || activeRun ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
    {activeRun ? "Reviewing…" : "Run review"}
  </button>;
}
