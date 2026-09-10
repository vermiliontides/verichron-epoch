import React, { useRef, useEffect, useState } from 'react';
import {
  Smartphone,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  ArrowDown,
  Copy,
  Check,
  AlertTriangle,
  FolderOpen,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { useDevicePull } from '../../hooks/useDevicePull';

interface DevicePullPanelProps {
  onBackupPulled: (destDir: string) => void;
}

export function DevicePullPanel({ onBackupPulled }: DevicePullPanelProps) {
  const {
    sources,
    sourceId,
    setSourceId,
    phase,
    toolStatus,
    actions,
    acquisitionOutput,
    acquisitionStep,
    acquisitionError,
    devices,
    selectedDevice,
    setSelectedDevice,
    destDir,
    pullProgress,
    pullError,
    runCompileFromSource,
    runHomebrewInstall,
    homebrewFallbackAvailable,
    handleSelectDestination,
    handlePull,
    checkAvailability,
  } = useDevicePull(onBackupPulled);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const terminalRef = useRef<HTMLPreElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  useEffect(() => {
    if (stickToBottom && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [acquisitionOutput, stickToBottom]);

  const handleTerminalScroll = () => {
    const el = terminalRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distanceFromBottom <= 64);
  };

  const jumpToLatest = () => {
    setStickToBottom(true);
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  };

  if (!sourceId) return null;

  return (
    <div className="bg-surface border border-border rounded-xl p-6 mb-6 shadow-sm">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="p-1.5 rounded-lg bg-accent/10 text-accent">
          <Smartphone size="1.25rem" />
        </div>
        <h3 className="font-display text-base font-semibold text-foreground">Import from iPhone</h3>
        {sources.length > 1 && (
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="ml-auto bg-surface-raised border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-foreground focus:border-accent focus:outline-none"
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {phase === 'checking' && (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-2">
          <Loader2 size="1rem" className="animate-spin text-accent" /> Checking for the required tool...
        </p>
      )}

      {phase === 'unavailable' && toolStatus && !toolStatus.available && (
        <div>
          <div className="flex items-center gap-2.5 text-sm text-flag bg-flag/10 border border-flag/20 px-3.5 py-2.5 rounded-lg mb-5">
            <XCircle size="1.125rem" className="shrink-0" />
            <span>iPhone import is not set up on this computer yet.</span>
          </div>

          {acquisitionError && (
            <div className="bg-flag/10 border border-flag/30 rounded-xl p-4 text-sm text-flag mb-5 shadow-xs">
              <div className="flex items-start gap-3">
                <AlertTriangle size="1.125rem" className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-flag">Setup Error</p>
                  <p className="text-xs text-foreground/90 mt-1 font-mono">{acquisitionError}</p>
                  {homebrewFallbackAvailable && (
                    <div className="mt-3.5 pt-3.5 border-t border-flag/20">
                      <p className="text-xs text-foreground/80 mb-2.5">
                        Homebrew is available on this Mac and can install the required libraries directly instead.
                      </p>
                      <button
                        onClick={() => runHomebrewInstall(['libplist', 'libimobiledevice'])}
                        className="inline-flex items-center gap-2 bg-surface-raised border border-flag/40 hover:bg-surface-raised/80 hover:border-flag text-foreground px-3.5 py-2 rounded-lg text-xs font-medium shadow-xs transition-all cursor-pointer"
                      >
                        <Wrench size="0.875rem" className="text-flag" /> Try Homebrew instead
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {actions.map((action, i) => (
            <div key={i} className="border border-border/80 rounded-xl p-5 mb-4 bg-surface/40 hover:bg-surface/60 transition-all shadow-xs">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {action.kind === 'install-instructions'
                      ? 'Install the required system tools'
                      : action.kind === 'compile-from-source'
                      ? 'Set up iPhone import automatically'
                      : action.kind === 'homebrew-install'
                      ? 'Install via Homebrew'
                      : 'Use a verified tool package'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {action.kind === 'install-instructions'
                      ? 'Complete this one-time setup in your terminal, then return here to import a backup directly from your iPhone.'
                      : action.kind === 'compile-from-source'
                      ? 'Epoch can build and configure the required components locally on this computer.'
                      : action.kind === 'homebrew-install'
                      ? 'Uses your existing Homebrew installation to install libplist and libimobiledevice — usually faster and more reliable than compiling from source.'
                      : 'A verified package can provide the components needed for direct iPhone import.'}
                  </p>
                </div>
                {action.kind === 'homebrew-install' && (
                  <span className="shrink-0 text-2xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
                    Recommended
                  </span>
                )}
              </div>
              
              {action.kind === 'install-instructions' && (
                <div className="mt-4 pt-3 border-t border-border/60">
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Terminal size="0.875rem" /> Terminal command (one-time setup):
                  </div>
                  <div className="flex flex-col gap-2">
                    {action.commands.map((c: string, j: number) => (
                      <div
                        key={j}
                        className="flex items-center justify-between gap-3 bg-background/90 border border-border/80 rounded-lg px-3.5 py-2.5 font-mono text-xs text-foreground/90 group"
                      >
                        <span className="truncate select-all">
                          <span className="text-accent select-none mr-2">$</span>
                          {c}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(c, j)}
                          className="flex items-center gap-1 text-2xs font-sans text-muted-foreground hover:text-foreground bg-surface-raised border border-border px-2.5 py-1 rounded-md transition-colors shrink-0 cursor-pointer shadow-2xs"
                          title="Copy command"
                        >
                          {copiedIndex === j ? (
                            <>
                              <Check size="0.75rem" className="text-accent" />
                              <span className="text-accent font-medium">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size="0.75rem" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {action.kind === 'homebrew-install' && (
                <div className="mt-4">
                  <button
                    onClick={() => runHomebrewInstall(action.formulas)}
                    className="inline-flex items-center gap-2 bg-accent text-background hover:bg-accent/90 active:scale-[0.99] px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm shadow-accent/15 transition-all cursor-pointer"
                  >
                    <Wrench size="1rem" /> Install with Homebrew
                  </button>
                </div>
              )}

              {action.kind === 'compile-from-source' && (
                <div className="mt-4">
                  <button
                    onClick={() => runCompileFromSource(action)}
                    className="inline-flex items-center gap-2 bg-accent text-background hover:bg-accent/90 active:scale-[0.99] px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm shadow-accent/15 transition-all cursor-pointer"
                  >
                    <Wrench size="1rem" /> {acquisitionError ? 'Retry setup' : 'Build automatically'}
                  </button>
                </div>
              )}

              {action.kind === 'download-verified-release' && (
                <p className="text-xs text-muted-foreground italic mt-3">
                  This option is not available yet. You can import an existing backup folder below instead.
                </p>
              )}
            </div>
          ))}
          
          <div className="mt-5">
            <button
              onClick={checkAvailability}
              className="inline-flex items-center gap-2 bg-surface-raised border border-border hover:border-accent/40 text-foreground px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-xs cursor-pointer"
            >
              <RefreshCw size="0.875rem" className="text-muted-foreground" /> Check again
            </button>
          </div>
        </div>
      )}

      {phase === 'acquiring' && (
        <div>
          <p className="text-sm text-foreground font-medium flex items-center gap-2 mb-3">
            <Loader2 size="1rem" className="animate-spin text-accent" /> {acquisitionStep ?? 'Working...'}
          </p>
          <div className="relative">
            <pre
              ref={terminalRef}
              onScroll={handleTerminalScroll}
              className="bg-background/90 border border-border/80 rounded-xl p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-72 text-foreground/80 leading-relaxed shadow-inner"
            >
              {acquisitionOutput.join('\n')}
            </pre>
            {!stickToBottom && acquisitionOutput.length > 0 && (
              <button
                onClick={jumpToLatest}
                className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-accent text-background text-xs font-semibold rounded-full px-3 py-1.5 shadow-lg hover:bg-accent/90 transition-all cursor-pointer"
              >
                <ArrowDown size="0.75rem" />
                Jump to latest
              </button>
            )}
          </div>
        </div>
      )}

      {(phase === 'available' || phase === 'pulling' || phase === 'pulled') && toolStatus?.available && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-accent uppercase tracking-wider font-semibold mb-4">
            <CheckCircle2 size="1rem" /> Device service ready
          </div>

          {devices.length === 0 ? (
            <div className="p-4 rounded-lg bg-surface/50 border border-border/60 text-sm text-muted-foreground">
              No devices connected. Plug your iPhone in via USB and unlock the screen.
            </div>
          ) : (
            <div className="border border-border/80 rounded-xl divide-y divide-border/60 mb-5 bg-surface/40 overflow-hidden shadow-xs">
              {devices.map((d) => (
                <label
                  key={d.id}
                  className={`flex items-center gap-3.5 px-4 py-3.5 text-sm cursor-pointer transition-colors ${
                    selectedDevice?.id === d.id ? 'bg-accent/5' : 'hover:bg-surface/80'
                  }`}
                >
                  <input
                    type="radio"
                    name="device"
                    checked={selectedDevice?.id === d.id}
                    onChange={() => setSelectedDevice(d)}
                    className="accent-accent"
                  />
                  <span className="text-foreground font-medium">{d.name}</span>
                  {d.model && <Badge variant="neutral">{d.model}</Badge>}
                  {d.osVersion && <span className="text-2xs text-muted-foreground font-mono">iOS {d.osVersion}</span>}
                </label>
              ))}
            </div>
          )}

          {selectedDevice && (
            <div className="flex items-center gap-3 mb-5 p-3 rounded-lg bg-surface/60 border border-border/60">
              <button
                onClick={handleSelectDestination}
                disabled={phase === 'pulling'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-raised border border-border hover:border-accent/40 text-xs font-medium text-foreground hover:text-accent disabled:opacity-50 transition-all shadow-xs cursor-pointer"
              >
                <FolderOpen size="0.875rem" className="text-accent" />
                {destDir ? 'Change destination' : 'Choose destination'}
              </button>
              {destDir ? (
                <span className="text-xs font-mono text-foreground/80 truncate" title={destDir}>
                  {destDir}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground italic">No destination chosen yet</span>
              )}
            </div>
          )}

          {selectedDevice && destDir && phase !== 'pulled' && (
            <button
              onClick={handlePull}
              disabled={phase === 'pulling'}
              className="inline-flex items-center gap-2 bg-accent text-background hover:bg-accent/90 disabled:opacity-50 active:scale-[0.99] px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm shadow-accent/15 transition-all cursor-pointer"
            >
              {phase === 'pulling' ? <Loader2 size="1rem" className="animate-spin" /> : null}
              {phase === 'pulling' ? 'Pulling backup...' : 'Pull backup'}
            </button>
          )}

          {pullProgress.length > 0 && (
            <pre className="bg-background/90 border border-border/80 rounded-xl p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-48 text-foreground/80 mt-5 shadow-inner leading-relaxed">
              {pullProgress.map((p) => p.message).join('\n')}
            </pre>
          )}
          {pullError && (
            <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg p-3.5 mt-4 flex items-center gap-2">
              <XCircle size="1rem" className="shrink-0" />
              <span>{pullError}</span>
            </div>
          )}
          {phase === 'pulled' && (
            <div className="text-sm text-accent bg-accent/10 border border-accent/30 rounded-lg p-3.5 mt-4 flex items-center gap-2 font-medium">
              <CheckCircle2 size="1.125rem" className="shrink-0" />
              <span>Backup imported successfully and ready for analysis.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}