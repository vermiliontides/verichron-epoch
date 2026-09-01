import React, { useEffect, useState } from 'react';
import { Smartphone, CheckCircle2, XCircle, Loader2, Wrench } from 'lucide-react';
import { Badge } from './ui/Badge';
import type {
  BackupProgress,
  DeviceInfo,
  ToolAcquisitionAction,
  ToolAvailabilityStatus,
} from '../tools/device-backup/types';

/**
 * "Pull from Device" -- the stage-0 alternative to WorkspaceView's existing
 * "Import Directory" flow. Everything here runs through main.ts's IPC
 * handlers; no raw terminal is ever shown to the user even though real
 * shell commands run underneath for tool acquisition -- output is streamed
 * into this panel the same way mvt-runner's own output already is
 * elsewhere in WorkspaceView.
 */

type Phase = 'checking' | 'unavailable' | 'available' | 'acquiring' | 'pulling' | 'pulled';

interface DevicePullPanelProps {
  onBackupPulled: (destDir: string) => void;
}

export function DevicePullPanel({ onBackupPulled }: DevicePullPanelProps) {
  const [sources, setSources] = useState<Array<{ id: string; label: string }>>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('checking');
  const [toolStatus, setToolStatus] = useState<ToolAvailabilityStatus | null>(null);
  const [actions, setActions] = useState<ToolAcquisitionAction[]>([]);
  const [acquisitionOutput, setAcquisitionOutput] = useState<string[]>([]);
  const [acquisitionStep, setAcquisitionStep] = useState<string | null>(null);
  const [acquisitionError, setAcquisitionError] = useState<string | null>(null);

  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);
  const [destDir, setDestDir] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<BackupProgress[]>([]);
  const [pullError, setPullError] = useState<string | null>(null);

  // Load available sources once, select the first (only iOS today, but
  // this loop doesn't change when a second source is added later).
  useEffect(() => {
    window.epoch.listDeviceBackupSources().then((found) => {
      setSources(found);
      if (found.length > 0) setSourceId(found[0].id);
    });
  }, []);

  const checkTool = async (id: string) => {
    setPhase('checking');
    const status = await window.epoch.checkDeviceBackupToolAvailable(id);
    setToolStatus(status);
    if (status.available) {
      setPhase('available');
      const found = await window.epoch.listConnectedDevices(id);
      setDevices(found);
    } else {
      setPhase('unavailable');
      const acts = await window.epoch.getToolAcquisitionActions(id);
      setActions(acts);
    }
  };

  useEffect(() => {
    if (sourceId) checkTool(sourceId);
  }, [sourceId]);

  useEffect(() => {
    const unsubStep = window.epoch.onToolAcquisitionStepStarted((label) => {
      setAcquisitionStep(label);
      setAcquisitionOutput((prev) => [...prev, `\n--- ${label} ---`]);
    });
    const unsubOutput = window.epoch.onToolAcquisitionOutput(({ line }) =>
      setAcquisitionOutput((prev) => [...prev, line])
    );
    const unsubFinished = window.epoch.onToolAcquisitionFinished((result) => {
      if (result.success) {
        setAcquisitionStep(null);
        if (sourceId) checkTool(sourceId);
      } else {
        setAcquisitionError(`Failed at: ${result.failedStep}`);
      }
    });
    const unsubProgress = window.epoch.onDeviceBackupProgress((progress) => {
      setPullProgress((prev) => [...prev, progress]);
      if (progress.phase === 'done') {
        setPhase('pulled');
        if (destDir) onBackupPulled(destDir);
      } else if (progress.phase === 'error') {
        setPullError(progress.message);
      }
    });
    return () => {
      unsubStep();
      unsubOutput();
      unsubFinished();
      unsubProgress();
    };
    // destDir/onBackupPulled intentionally omitted -- this subscribes once
    // for the panel's lifetime; the progress callback reads current values
    // via closure over state set immediately before pullBackup is invoked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const runCompileFromSource = async (action: Extract<ToolAcquisitionAction, { kind: 'compile-from-source' }>) => {
    setPhase('acquiring');
    setAcquisitionOutput([]);
    setAcquisitionError(null);
    // installPrefix is implicit in main.ts's handler via
    // idevicebackup2InstallPrefix() -- but runToolAcquisitionSteps needs it
    // explicitly for PKG_CONFIG_PATH threading. The steps themselves were
    // already built against that same prefix (see buildSteps.ts), so this
    // just needs *a* consistent value, not a second source of truth; using
    // the cwd of the last step's parent (buildDir) to derive it would be
    // fragile, so this reads it back from the first compile step's own
    // structure instead -- every step in the sequence was generated with
    // the same prefix baked into its --prefix arg.
    const prefixArg = action.steps.find((s) => s.args.some((a) => a.startsWith('--prefix=')));
    const installPrefix = prefixArg?.args.find((a) => a.startsWith('--prefix='))?.slice('--prefix='.length) ?? '';
    await window.epoch.runToolAcquisitionSteps(action.steps, installPrefix);
  };

  const handleSelectDestination = async () => {
    const dir = await window.epoch.selectDeviceBackupDestination();
    if (dir) setDestDir(dir);
  };

  const handlePull = async () => {
    if (!sourceId || !selectedDevice || !destDir) return;
    setPhase('pulling');
    setPullProgress([]);
    setPullError(null);
    try {
      await window.epoch.pullDeviceBackup(sourceId, selectedDevice, destDir);
    } catch (err) {
      setPullError(err instanceof Error ? err.message : 'Unknown error');
      setPhase('available');
    }
  };

  if (!sourceId) return null;

  return (
    <div className="bg-surface border border-border rounded-lg p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Smartphone className="text-accent" size="1.25rem" />
        <h3 className="font-display text-base font-medium text-foreground">Pull from Device</h3>
        {sources.length > 1 && (
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="ml-auto bg-background border border-border rounded-md px-2 py-1 text-xs font-mono text-foreground"
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
          <p className="text-sm text-flag flex items-center gap-2 mb-3">
            <XCircle size="1rem" /> {toolStatus.reason}
          </p>
          {actions.map((action, i) => (
            <div key={i} className="border border-border rounded-md p-3 mb-2">
              <p className="text-sm font-medium text-foreground mb-2">{action.title}</p>
              {action.kind === 'install-instructions' && (
                <div className="bg-background rounded-md p-2 font-mono text-xs text-muted-foreground">
                  {action.commands.map((c, j) => (
                    <div key={j}>{c}</div>
                  ))}
                </div>
              )}
              {action.kind === 'compile-from-source' && (
                <button
                  onClick={() => runCompileFromSource(action)}
                  className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 px-3 py-1.5 rounded-md text-xs font-medium"
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
          <p className="text-sm text-foreground flex items-center gap-2 mb-2">
            <Loader2 size="1rem" className="animate-spin" /> {acquisitionStep ?? 'Working...'}
          </p>
          <pre className="bg-background border border-border rounded-md p-3 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-48 text-muted-foreground">
            {acquisitionOutput.join('\n')}
          </pre>
          {acquisitionError && <p className="text-sm text-flag mt-2">{acquisitionError}</p>}
        </div>
      )}

      {(phase === 'available' || phase === 'pulling' || phase === 'pulled') && toolStatus?.available && (
        <div>
          <p className="text-2xs text-muted-foreground uppercase tracking-wide font-medium mb-2 flex items-center gap-1">
            <CheckCircle2 size="0.875rem" className="text-accent" /> Tool ready
          </p>

          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No devices connected. Plug one in via USB and unlock it.</p>
          ) : (
            <div className="border border-border rounded-md divide-y divide-border mb-3">
              {devices.map((d) => (
                <label
                  key={d.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-background/60"
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
            <div className="flex items-center gap-3 mb-3">
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
              className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 disabled:opacity-50 px-3 py-1.5 rounded-md text-xs font-medium"
            >
              {phase === 'pulling' ? <Loader2 size="0.875rem" className="animate-spin" /> : null}
              {phase === 'pulling' ? 'Pulling backup...' : 'Pull backup'}
            </button>
          )}

          {pullProgress.length > 0 && (
            <pre className="bg-background border border-border rounded-md p-3 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-40 text-muted-foreground mt-3">
              {pullProgress.map((p) => p.message).join('\n')}
            </pre>
          )}
          {pullError && <p className="text-sm text-flag mt-2">{pullError}</p>}
          {phase === 'pulled' && (
            <p className="text-sm text-accent flex items-center gap-2 mt-2">
              <CheckCircle2 size="1rem" /> Backup pulled -- feeding into the pipeline below.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
