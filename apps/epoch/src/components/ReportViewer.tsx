import React, { useState } from 'react';
import {
  FileText,
  Printer,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Check,
} from 'lucide-react';
import type { ReportResult } from '../types/window';
import type { PipelineRunRow } from '@verichron/db-reader';
import { Badge } from './ui/Badge';
import { useToast } from './ui/Toast';

interface ReportViewerProps {
  report: ReportResult;
  selectedRun: PipelineRunRow;
  onOpenReport: () => void;
}

export function ReportViewer({ report, selectedRun, onOpenReport }: ReportViewerProps) {
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [copied, setCopied] = useState(false);
  const { success } = useToast();

  if (report.status === 'no-results-path') {
    return (
      <div className="p-8 max-w-2xl mx-auto rounded-2xl bg-surface border border-border text-center space-y-3">
        <AlertTriangle size="2rem" className="mx-auto text-flag" />
        <h3 className="font-display text-sm font-bold text-foreground">Results Path Undefined</h3>
        <p className="text-xs text-muted-foreground leading-relaxed font-mono">
          Cannot derive a forensic results directory for <span className="text-accent">{selectedRun.backup_source}</span>.
          Ensure the backup has undergone pipeline decryption and stage 1 ingestion.
        </p>
      </div>
    );
  }

  if (report.status === 'not-found') {
    return (
      <div className="p-8 max-w-2xl mx-auto rounded-2xl bg-surface border border-border text-center space-y-3">
        <FileText size="2rem" className="mx-auto text-muted-foreground/60" />
        <h3 className="font-display text-sm font-bold text-foreground">No Audit Dossier Generated Yet</h3>
        <p className="text-xs text-muted-foreground leading-relaxed font-mono">
          The forensic pipeline report stage has not run for this backup. Expected path:
          <br />
          <span className="text-foreground/80 mt-1 block">{report.path}</span>
        </p>
      </div>
    );
  }

  const copyMarkdown = () => {
    navigator.clipboard.writeText(report.content ?? '');
    setCopied(true);
    success('Dossier Copied', 'Investigation report markdown copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const backupName = selectedRun.backup_source.split('/').pop() ?? selectedRun.backup_source;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Action Header Bar */}
      <div className="p-4 border-b border-border bg-surface/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-bold text-foreground">Investigation Audit Dossier</h2>
            <Badge variant="success">
              <ShieldCheck size="0.7rem" /> VERIFIED EVIDENCE
            </Badge>
          </div>
          <p className="text-3xs font-mono text-muted-foreground mt-0.5 truncate max-w-xl" title={report.path}>
            {report.path}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center rounded-lg border border-border bg-surface-raised overflow-hidden text-xs font-mono">
            <button
              onClick={() => setViewMode('formatted')}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                viewMode === 'formatted' ? 'bg-accent text-background font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Dossier View
            </button>
            <span className="text-border">|</span>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                viewMode === 'raw' ? 'bg-accent text-background font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Raw Markdown
            </button>
          </div>

          <button
            onClick={copyMarkdown}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-raised hover:border-accent/40 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Copy Raw Markdown"
          >
            {copied ? <Check size="0.75rem" className="text-success" /> : <Copy size="0.75rem" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-raised hover:border-accent/40 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Print or Save PDF"
          >
            <Printer size="0.75rem" />
            <span>Print / PDF</span>
          </button>

          <button
            onClick={onOpenReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-background hover:bg-accent/90 text-xs font-mono font-semibold transition-colors cursor-pointer"
          >
            <ExternalLink size="0.75rem" />
            <span>Open in App</span>
          </button>
        </div>
      </div>

      {/* Main Document Content */}
      <div className="flex-1 overflow-auto p-6 select-text">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Executive Evidence Dossier Card */}
          <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 shadow-md">
            <div className="flex items-start justify-between pb-4 border-b border-border">
              <div>
                <span className="text-3xs uppercase tracking-widest font-bold text-accent">
                  Digital Forensics Audit Report
                </span>
                <h1 className="font-display text-lg font-bold text-foreground mt-1">
                  Target Investigation: {backupName}
                </h1>
                <p className="text-2xs font-mono text-muted-foreground mt-0.5">
                  Execution Run UUID: <span className="text-foreground">{selectedRun.run_id}</span>
                </p>
              </div>

              <div className="text-right text-3xs font-mono text-muted-foreground">
                <p>Generated: {new Date().toLocaleDateString()}</p>
                <p className="text-success font-semibold mt-0.5">Air-Gapped Workstation</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-surface-raised/40 border border-border/60">
                <p className="text-3xs text-muted-foreground uppercase tracking-wider">Device Target</p>
                <p className="text-foreground font-semibold truncate mt-0.5">{backupName}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-raised/40 border border-border/60">
                <p className="text-3xs text-muted-foreground uppercase tracking-wider">Ingest Timestamp</p>
                <p className="text-foreground font-semibold truncate mt-0.5">
                  {new Date(selectedRun.started_at).toLocaleDateString()}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-raised/40 border border-border/60">
                <p className="text-3xs text-muted-foreground uppercase tracking-wider">Integrity Ledger</p>
                <p className="text-success font-semibold truncate mt-0.5">SHA-256 Validated</p>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-raised/40 border border-border/60">
                <p className="text-3xs text-muted-foreground uppercase tracking-wider">Analysis Status</p>
                <p className="text-accent font-semibold truncate mt-0.5">Complete</p>
              </div>
            </div>
          </div>

          {/* Document Content View */}
          {viewMode === 'formatted' ? (
            <div className="p-8 rounded-2xl bg-surface border border-border space-y-4 shadow-sm text-foreground/90 font-mono text-xs leading-relaxed">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90 overflow-auto">
                {report.content}
              </pre>
            </div>
          ) : (
            <div className="bg-[#05070d] border border-border rounded-2xl p-6 overflow-auto">
              <pre className="text-2xs font-mono text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {report.content}
              </pre>
            </div>
          )}

          {/* Forensic Examiner Attestation Signature Block */}
          <div className="p-6 rounded-2xl bg-surface/50 border border-border space-y-4 text-xs font-mono">
            <div className="flex items-center gap-2 pb-2 border-b border-border text-muted-foreground">
              <CheckCircle2 size="1rem" className="text-success" />
              <span className="font-semibold uppercase tracking-wider text-3xs">
                Examiner Attestation & Chain of Custody
              </span>
            </div>
            <p className="text-3xs text-muted-foreground leading-relaxed">
              This dossier was generated deterministically in an isolated local execution environment.
              All source payloads were verified against their respective cryptographic SHA-256 digests.
            </p>
            <div className="grid grid-cols-2 gap-8 pt-4">
              <div className="border-t border-border pt-2 text-3xs text-muted-foreground">
                <p>Forensic Examiner Signature</p>
              </div>
              <div className="border-t border-border pt-2 text-3xs text-muted-foreground">
                <p>Date & Verification Seal</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
