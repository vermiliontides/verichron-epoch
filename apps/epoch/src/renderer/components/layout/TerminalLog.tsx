import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ArrowDown, TerminalSquare } from 'lucide-react';
import type { MvtLogEntry } from '../types/window';

interface TerminalLogProps {
  lines: MvtLogEntry[];
  live: boolean;
  defaultOpen?: boolean;
  label?: string;
}

// How close to the bottom (in px) counts as "still at the bottom" for the
// purposes of deciding whether to auto-scroll. A user's trackpad/wheel
// scroll rarely lands on exactly 0, so a small tolerance avoids treating a
// stable "I'm reading the end" position as "I scrolled away".
const BOTTOM_THRESHOLD_PX = 24;

export function TerminalLog({ lines, live, defaultOpen = false, label = 'Technical log' }: TerminalLogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [stickToBottom, setStickToBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const unseenCountRef = useRef(0);
  const [unseenCount, setUnseenCount] = useState(0);

  // Auto-scroll runs on every new line, but only while the panel is open
  // and the user hasn't scrolled away from the bottom -- this is the
  // behavior that was missing before: a naive "always scroll to bottom on
  // update" fights the user the moment they try to scroll up to read
  // something mid-run.
  useEffect(() => {
    if (!open) {
      unseenCountRef.current += 1;
      setUnseenCount(unseenCountRef.current);
      return;
    }
    if (stickToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // Deliberately omits stickToBottom/scrollRef from deps -- this should
    // only re-run when new lines arrive or the panel opens, not whenever
    // stickToBottom changes (that's handled by the scroll handler itself).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="border border-border rounded-md overflow-hidden bg-background">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface/80 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {open ? <ChevronDown size="0.9rem" /> : <ChevronRight size="0.9rem" />}
          <TerminalSquare size="0.9rem" />
          {label}
          {live && (
            <span className="flex items-center gap-1.5 ml-1 text-2xs uppercase tracking-wide text-flag">
              <span className="w-1.5 h-1.5 rounded-full bg-flag animate-pulse" />
              live
            </span>
          )}
        </span>
        {!open && unseenCount > 0 && (
          <span className="text-2xs font-mono text-muted-foreground bg-background rounded px-1.5 py-0.5">
            {unseenCount} new line{unseenCount === 1 ? '' : 's'}
          </span>
        )}
      </button>

      {open && (
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-64 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed"
          >
            {lines.length === 0 ? (
              <p className="text-muted-foreground italic">No output yet.</p>
            ) : (
              lines.map((entry, i) => (
                <div
                  key={i}
                  className={entry.stream === 'stderr' ? 'text-danger' : 'text-foreground/80'}
                >
                  {entry.line || '\u00A0'}
                </div>
              ))
            )}
          </div>
          {!stickToBottom && lines.length > 0 && (
            <button
              onClick={jumpToBottom}
              className="absolute bottom-2 right-2 flex items-center gap-1 bg-accent text-background text-2xs font-medium rounded-full px-2.5 py-1 shadow-lg hover:bg-accent/90 transition-colors"
            >
              <ArrowDown size="0.7rem" />
              Jump to latest
            </button>
          )}
        </div>
      )}
    </div>
  );
}