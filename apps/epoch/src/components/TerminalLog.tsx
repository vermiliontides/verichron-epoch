import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ArrowDown, Terminal, Copy, Check } from 'lucide-react';
import type { MvtLogEntry } from '../types/window';
import { useToast } from './ui/Toast';

interface TerminalLogProps {
  lines: MvtLogEntry[];
  live: boolean;
  defaultOpen?: boolean;
}

const BOTTOM_THRESHOLD_PX = 24;

export function TerminalLog({ lines, live, defaultOpen = false }: TerminalLogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const unseenCountRef = useRef(0);
  const [unseenCount, setUnseenCount] = useState(0);
  const { success } = useToast();

  useEffect(() => {
    if (!open) {
      unseenCountRef.current += 1;
      setUnseenCount(unseenCountRef.current);
      return;
    }
    if (stickToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length, open]);

  useEffect(() => {
    if (open) {
      unseenCountRef.current = 0;
      setUnseenCount(0);
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distanceFromBottom <= BOTTOM_THRESHOLD_PX);
  };

  const jumpToBottom = () => {
    setStickToBottom(true);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  const copyLog = (e: React.MouseEvent) => {
    e.stopPropagation();
    const fullText = lines.map((l) => `[${l.stream}] ${l.line}`).join('\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    success('Log Copied', `${lines.length} lines copied to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background shadow-lg">
      {/* Terminal Title Bar */}
      <div
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface border-b border-border cursor-pointer hover:bg-surface-raised transition-colors select-none"
      >
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          {open ? <ChevronDown size="0.95rem" /> : <ChevronRight size="0.95rem" />}
          <Terminal size="0.95rem" className="text-accent" />
          <span className="font-mono font-semibold text-foreground text-xs uppercase tracking-wider">
            Execution Telemetry Log
          </span>

          {live && (
            <span className="flex items-center gap-1.5 px-2 py-0.2 rounded-full bg-accent/15 border border-accent/30 text-accent text-3xs font-mono font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              STREAMING
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!open && unseenCount > 0 && (
            <span className="text-3xs font-mono text-accent bg-accent/10 border border-accent/20 rounded px-1.5 py-0.2">
              +{unseenCount} lines
            </span>
          )}

          {lines.length > 0 && (
            <button
              onClick={copyLog}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-mono text-muted-foreground hover:text-foreground bg-surface-raised hover:border-accent/40 border border-border transition-colors cursor-pointer"
              title="Copy entire log to clipboard"
            >
              {copied ? <Check size="0.65rem" className="text-success" /> : <Copy size="0.65rem" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-72 overflow-y-auto p-3 font-mono text-2xs leading-relaxed bg-[#05070d]"
          >
            {lines.length === 0 ? (
              <p className="text-muted-foreground/60 italic">No output stream captured yet.</p>
            ) : (
              lines.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 hover:bg-surface/40 px-1 py-0.5 rounded">
                  <span className="text-3xs text-muted-foreground/40 select-none w-7 text-right shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <span
                    className={`break-all ${
                      entry.stream === 'stderr'
                        ? 'text-danger font-medium'
                        : entry.line.includes('[check]') || entry.line.includes('===')
                        ? 'text-accent font-semibold'
                        : entry.line.includes('error') || entry.line.includes('fail')
                        ? 'text-danger'
                        : 'text-foreground/80'
                    }`}
                  >
                    {entry.line || '\u00A0'}
                  </span>
                </div>
              ))
            )}
          </div>

          {!stickToBottom && lines.length > 0 && (
            <button
              onClick={jumpToBottom}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-accent text-background text-2xs font-semibold rounded-full px-3 py-1 shadow-lg hover:bg-accent/90 transition-all cursor-pointer"
            >
              <ArrowDown size="0.75rem" />
              Latest
            </button>
          )}
        </div>
      )}
    </div>
  );
}
