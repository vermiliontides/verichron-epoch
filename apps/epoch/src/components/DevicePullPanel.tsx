import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  FolderOpen,
  Download,
  AlertCircle,
  Usb,
} from 'lucide-react';
import { Badge } from './ui/Badge';
import type {
  BackupProgress,
  DeviceInfo,
  ToolAcquisitionAction,
  ToolAvailabilityStatus,
} from '../tools/device-backup/types';

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
      if (found.length > 0 && !selectedDevice) {
        setSelectedDevice(found[0]);
      }
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
  }, [sourceId]);

  const runCompileFromSource = async (action: Extract<ToolAcquisitionAction, { kind: 'compile-from-source' }>) => {
    setPhase('acquiring');
    setAcquisitionOutput([]);
    setAcquisitionError(null);
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
    <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent">
            <Smartphone size="1.1rem" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
              Physical iOS Device Acquisition
              <Badge variant="subtle">STAGE 0</Badge>
            </h3>
            <p className="text-3xs text-muted-foreground">
              Extract raw encrypted backup via direct USB connection (libimobiledevice)
            </p>
          </div>
        </div>

        {sources.length > 1 && (
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="bg-surface-raised border border-border rounded-md px-2 py-1 text-2xs font-mono text-foreground focus:border-accent"
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tool checking state */}
      {phase === 'checking' && (
        <div className="flex items-center gap-2.5 py-6 text-sm text-muted-foreground justify-center font-mono text-xs">
          <Loader2 size="1rem" className="animate-spin text-accent" />
          Checking local toolchain status...
        </div>
      )}

      {/* Tool unavailable */}
      {phase === 'unavailable' && toolStatus && !toolStatus.available && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-flag/10 border border-flag/30 text-flag text-xs">
            <AlertCircle size="1rem" className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs">Toolchain Missing: {toolStatus.reason}</p>
              <p className="text-2xs opacity-90 mt-0.5">
                Verichron requires <code className="font-mono">idevicebackup2</code> to pull physical iOS backups over USB.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {actions.map((action, i) => (
              <div key={i} className="border border-border rounded-lg p-3.5 bg-surface-raised/40">
                <p className="text-xs font-semibold text-foreground mb-2">{action.title}</p>
                {action.kind === 'install-instructions' && (
                  <div className="bg-background rounded-md p-2.5 font-mono text-2xs text-muted-foreground border border-border/60">
                    {action.commands.map((c, j) => (
                      <div key={j} className="text-accent">{c}</div>
                    ))}
                  </div>
                )}
                {action.kind === 'compile-from-source' && (
                  <button
                    onClick={() => runCompileFromSource(action)}
                    className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Wrench size="0.85rem" /> Compile & Install Locally
                  </button>
                )}
                {action.kind === 'download-verified-release' && (
                  <p className="text-2xs text-muted-foreground italic">
                    Verified binary build not available for this host platform.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acquiring / compiling tool */}
      {phase === 'acquiring' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono text-foreground">
            <Loader2 size="1rem" className="animate-spin text-accent" />
            <span>Building Toolchain: <strong className="text-accent">{acquisitionStep ?? 'In progress...'}</strong></span>
          </div>
          <pre className="bg-[#05070d] border border-border rounded-lg p-3 text-3xs font-mono whitespace-pre-wrap overflow-auto max-h-48 text-muted-foreground">
            {acquisitionOutput.join('\n')}
          </pre>
          {acquisitionError && (
            <p className="text-xs text-danger font-mono bg-danger/10 border border-danger/30 p-2.5 rounded-md">
              {acquisitionError}
            </p>
          )}
        </div>
      )}

      {/* Available or Pulling */}
      {(phase === 'available' || phase === 'pulling' || phase === 'pulled') && toolStatus?.available && (
        <div className="space-y-4">
          {/* Step 1: Device List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xs uppercase tracking-wider font-semibold text-muted-foreground">
                Connected USB Devices
              </span>
              <Badge variant="success">
                <CheckCircle2 size="0.7rem" /> idevicebackup2 Ready
              </Badge>
            </div>

            {devices.length === 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-border bg-surface-raised/20 text-xs text-muted-foreground font-mono">
                <Usb size="1.25rem" className="text-accent shrink-0 animate-pulse" />
                <div>
                  <p className="font-semibold text-foreground">No iOS Device Detected</p>
                  <p className="text-3xs text-muted-foreground">
                    Connect an iPhone or iPad via USB cable. Unlock the device and tap "Trust This Computer" when prompted.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {devices.map((d) => {
                  const isSelected = selectedDevice?.id === d.id;
                  return (
                    <div
                      key={d.id}
                      onClick={() => setSelectedDevice(d)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-surface-raised border-accent/50 shadow-sm'
                          : 'bg-surface-raised/30 border-border hover:bg-surface-raised/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded flex items-center justify-center ${isSelected ? 'bg-accent/20 text-accent' : 'bg-surface text-muted-foreground'}`}>
                          <Smartphone size="1rem" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{d.name}</p>
                          <p className="text-3xs font-mono text-muted-foreground">
                            UDID: {d.id.slice(0, 16)}...
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {d.model && <Badge variant="neutral">{d.model}</Badge>}
                        {d.osVersion && (
                          <span className="text-2xs font-mono text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded">
                            iOS {d.osVersion}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Storage Destination */}
          {selectedDevice && (
            <div className="p-3 rounded-lg bg-surface-raised/40 border border-border flex items-center justify-between">
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-3xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Extraction Destination
                </p>
                <p className="text-xs font-mono text-foreground truncate mt-0.5">
                  {destDir || 'No destination selected (required)'}
                </p>
              </div>
              <button
                onClick={handleSelectDestination}
                disabled={phase === 'pulling'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono border border-border bg-surface hover:border-accent/40 text-foreground transition-colors shrink-0 cursor-pointer disabled:opacity-50"
              >
                <FolderOpen size="0.85rem" className="text-accent" />
                {destDir ? 'Change' : 'Choose Path'}
              </button>
            </div>
          )}

          {/* Step 3: Trigger Extraction */}
          {selectedDevice && destDir && phase !== 'pulled' && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-2xs text-muted-foreground">
                Extraction may take several minutes depending on device storage.
              </p>
              <button
                onClick={handlePull}
                disabled={phase === 'pulling'}
                className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 disabled:opacity-50 px-4 py-2 rounded-lg text-xs font-semibold shadow-md transition-colors cursor-pointer"
              >
                {phase === 'pulling' ? (
                  <>
                    <Loader2 size="0.9rem" className="animate-spin" /> Pulling iOS Backup...
                  </>
                ) : (
                  <>
                    <Download size="0.9rem" /> Begin Acquisition
                  </>
                )}
              </button>
            </div>
          )}

          {/* Progress telemetry */}
          {pullProgress.length > 0 && (
            <pre className="bg-[#05070d] border border-border rounded-lg p-3 text-3xs font-mono whitespace-pre-wrap overflow-auto max-h-36 text-muted-foreground">
              {pullProgress.map((p) => p.message).join('\n')}
            </pre>
          )}

          {pullError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs font-mono">
              <XCircle size="1rem" className="shrink-0 mt-0.5" />
              <span>{pullError}</span>
            </div>
          )}

          {phase === 'pulled' && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-success/10 border border-success/30 text-success text-xs font-medium">
              <CheckCircle2 size="1.1rem" className="shrink-0" />
              <span>Physical backup acquired successfully. Target ready for pipeline ingestion below.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
