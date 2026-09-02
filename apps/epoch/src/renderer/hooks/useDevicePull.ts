import { useEffect, useState } from 'react';
import type {
  BackupProgress,
  DeviceInfo,
  ToolAcquisitionAction,
  ToolAcquisitionCommand,
  ToolAvailabilityStatus,
} from '../../shared/types/tools';

export type Phase = 'checking' | 'unavailable' | 'available' | 'acquiring' | 'pulling' | 'pulled';

export function useDevicePull(onBackupPulled?: (destDir: string) => void) {
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
        if (destDir && onBackupPulled) onBackupPulled(destDir);
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
  }, [sourceId, destDir, onBackupPulled]);

  const runCompileFromSource = async (action: Extract<ToolAcquisitionAction, { kind: 'compile-from-source' }>) => {
    setPhase('acquiring');
    setAcquisitionOutput([]);
    setAcquisitionError(null);
    const prefixArg = action.steps.find((s: ToolAcquisitionCommand) => s.args.some((a: string) => a.startsWith('--prefix=')));
    const installPrefix = prefixArg?.args.find((a: string) => a.startsWith('--prefix='))?.slice('--prefix='.length) ?? '';
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

  return {
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
  };
}