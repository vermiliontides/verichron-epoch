import React from 'react';
import { Smartphone, CheckCircle2, XCircle, Loader2, Wrench } from 'lucide-react';
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
    handleSelectDestination,
    handlePull,
  } = useDevicePull(onBackupPulled);

  if (!sourceId) return null;

  return (
    <div className="bg-surface border border-border rounded-lg p-6 mb-6">
      <div className="flex items-center gap-2 mb-5">
        <Smartphone className="text-accent" size="1.25rem" />
        <h3 className="font-display text-base font-medium text-foreground">Pull from Device</h3>
        {sources.length > 1 && (
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="ml-auto bg-background border border-border rounded-md px-3 py-1.5 text-xs font-mono text-foreground"
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
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 size="1rem" className="animate-spin" /> Checking for the required tool...
        </p>
      )}

      {phase === 'unavailable' && toolStatus && !toolStatus.available && (
        <div>
          <p className="text-sm text-flag flex items-center gap-2 mb-4">
            <XCircle size="1rem" /> {toolStatus.reason}
          </p>
          {actions.map((action, i) => (
            <div key={i} className="border border-border rounded-md p-4 mb-3">
              <p className="text-sm font-medium text-foreground mb-3">{action.title}</p>
              {action.kind === 'install-instructions' && (
                <div className="bg-background rounded-md p-3 font-mono text-xs text-muted-foreground">
                  {action.commands.map((c, j) => (
                    <div key={j}>{c}</div>
                  ))}
                </div>
              )}
              {action.kind === 'compile-from-source' && (
                <button
                  onClick={() => runCompileFromSource(action)}
                  className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 px-4 py-2 rounded-md text-xs font-medium"
                >
                  <Wrench size="0.875rem" /> Build automatically
                </button>
              )}
              {action.kind === 'download-verified-release' && (
                <p className="text-xs text-muted-foreground italic">
                  Not yet available -- no verified release has been published yet.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {phase === 'acquiring' && (
        <div>
          <p className="text-sm text-foreground flex items-center gap-2 mb-3">
            <Loader2 size="1rem" className="animate-spin" /> {acquisitionStep ?? 'Working...'}
          </p>
          <pre className="bg-background border border-border rounded-md p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-48 text-muted-foreground">
            {acquisitionOutput.join('\n')}
          </pre>
          {acquisitionError && <p className="text-sm text-flag mt-3">{acquisitionError}</p>}
        </div>
      )}

      {(phase === 'available' || phase === 'pulling' || phase === 'pulled') && toolStatus?.available && (
        <div>
          <p className="text-2xs text-muted-foreground uppercase tracking-wide font-medium mb-3 flex items-center gap-1">
            <CheckCircle2 size="0.875rem" className="text-accent" /> Tool ready
          </p>

          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No devices connected. Plug one in via USB and unlock it.</p>
          ) : (
            <div className="border border-border rounded-md divide-y divide-border mb-4">
              {devices.map((d) => (
                <label
                  key={d.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm cursor-pointer hover:bg-background/60"
                >
                  <input
                    type="radio"
                    name="device"
                    checked={selectedDevice?.id === d.id}
                    onChange={() => setSelectedDevice(d)}
                  />
                  <span className="text-foreground">{d.name}</span>
                  {d.model && <Badge variant="neutral">{d.model}</Badge>}
                  {d.osVersion && <span className="text-2xs text-muted-foreground font-mono">iOS {d.osVersion}</span>}
                </label>
              ))}
            </div>
          )}

          {selectedDevice && (
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={handleSelectDestination}
                disabled={phase === 'pulling'}
                className="text-xs text-accent hover:underline disabled:opacity-50"
              >
                {destDir ? 'Change destination' : 'Choose destination'}
              </button>
              {destDir && <span className="text-2xs font-mono text-muted-foreground truncate">{destDir}</span>}
            </div>
          )}

          {selectedDevice && destDir && phase !== 'pulled' && (
            <button
              onClick={handlePull}
              disabled={phase === 'pulling'}
              className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 disabled:opacity-50 px-4 py-2 rounded-md text-xs font-medium"
            >
              {phase === 'pulling' ? <Loader2 size="0.875rem" className="animate-spin" /> : null}
              {phase === 'pulling' ? 'Pulling backup...' : 'Pull backup'}
            </button>
          )}

          {pullProgress.length > 0 && (
            <pre className="bg-background border border-border rounded-md p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-40 text-muted-foreground mt-4">
              {pullProgress.map((p) => p.message).join('\n')}
            </pre>
          )}
          {pullError && <p className="text-sm text-flag mt-3">{pullError}</p>}
          {phase === 'pulled' && (
            <p className="text-sm text-accent flex items-center gap-2 mt-3">
              <CheckCircle2 size="1rem" /> Backup pulled -- feeding into the pipeline below.
            </p>
          )}
        </div>
      )}
    </div>
  );
}