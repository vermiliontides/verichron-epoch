import { useEffect, useState, useCallback } from 'react';
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
  const [homebrewFallbackAvailable, setHomebrewFallbackAvailable] = useState(false);

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

  const checkTool = useCallback(async (id: string) => {
    // Reset stale state before rechecking
    setPhase('checking');
    setAcquisitionStep(null);
    setAcquisitionError(null);
    setHomebrewFallbackAvailable(false);
    setDevices([]);
    setSelectedDevice(null);
    setActions([]);

    try {
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
    } catch (error: unknown) {
      setPhase('unavailable');
      setAcquisitionStep(null);
      setAcquisitionError(error instanceof Error ? error.message : 'Failed to communicate with the device service.');
    }
  }, []);

  useEffect(() => {
    if (sourceId) checkTool(sourceId);
  }, [sourceId, checkTool]);

  const checkAvailability = useCallback(() => {
    if (sourceId) checkTool(sourceId);
  }, [sourceId, checkTool]);

  useEffect(() => {
    let outputBuffer: string[] = [];
    let outputRafId: number | null = null;

    const flushOutputBuffer = () => {
      if (outputBuffer.length > 0) {
        const batch = [...outputBuffer];
        outputBuffer = [];
        setAcquisitionOutput((prev) => {
          const next = [...prev, ...batch];
          return next.length > 2500 ? next.slice(next.length - 2500) : next;
        });
      }
      outputRafId = null;
    };

    const unsubStep = window.epoch.onToolAcquisitionStepStarted((label) => {
      setAcquisitionStep(label);
      outputBuffer.push(`\n--- ${label} ---`);
      if (outputRafId === null) {
        outputRafId = requestAnimationFrame(flushOutputBuffer);
      }
    });
    const unsubOutput = window.epoch.onToolAcquisitionOutput(({ line }) => {
      outputBuffer.push(line);
      if (outputRafId === null) {
        outputRafId = requestAnimationFrame(flushOutputBuffer);
      }
    });
    const unsubFinished = window.epoch.onToolAcquisitionFinished((result) => {
      if (outputRafId !== null) {
        cancelAnimationFrame(outputRafId);
        flushOutputBuffer();
      }
      if (result.success) {
        setAcquisitionStep(null);
        setHomebrewFallbackAvailable(false);
        if (sourceId) checkTool(sourceId);
      } else {
        setPhase('unavailable');
        setAcquisitionStep(null);
        setAcquisitionError(`Failed at: ${result.failedStep}`);
        setHomebrewFallbackAvailable(!!result.homebrewFallbackAvailable);
      }
    });
    const unsubProgress = window.epoch.onDeviceBackupProgress((progress) => {
      setPullProgress((prev) => [...prev, progress]);
      if (progress.phase === 'done') {
        setPhase('pulled');
        if (destDir && onBackupPulled) onBackupPulled(destDir);
      } else if (progress.phase === 'error') {
        setPullError(progress.message);
        setPhase('available');
      }
    });

    return () => {
      if (outputRafId !== null) {
        cancelAnimationFrame(outputRafId);
      }
      unsubStep();
      unsubOutput();
      unsubFinished();
      unsubProgress();
    };
  }, [sourceId, destDir, onBackupPulled, checkTool]);

  const runCompileFromSource = async (action: Extract<ToolAcquisitionAction, { kind: 'compile-from-source' }>) => {
    setPhase('acquiring');
    setAcquisitionOutput([]);
    setAcquisitionError(null);
    setAcquisitionStep('Preparing build...');
    
    try {
      const prefixArg = action.steps.find((s: ToolAcquisitionCommand) => s.args.some((a: string) => a.startsWith('--prefix=')));
      const installPrefix = prefixArg?.args.find((a: string) => a.startsWith('--prefix='))?.slice('--prefix='.length) ?? '';
      await window.epoch.runToolAcquisitionSteps(action.steps, installPrefix);
    } catch (error: unknown) {
      setPhase('unavailable');
      setAcquisitionStep(null);
      setAcquisitionError(error instanceof Error ? error.message : 'IPC rejection during tool acquisition.');
    }
  };

  const runHomebrewInstall = async (formulas: string[]) => {
    setPhase('acquiring');
    setAcquisitionOutput([]);
    setAcquisitionError(null);
    setAcquisitionStep(`Install via Homebrew (${formulas.join(', ')})`);
    setHomebrewFallbackAvailable(false);

    try {
      await window.epoch.runHomebrewInstall(formulas);
    } catch (error: unknown) {
      setPhase('unavailable');
      setAcquisitionStep(null);
      setAcquisitionError(error instanceof Error ? error.message : 'Failed to run Homebrew installation.');
    }
  };

  const handleSelectDestination = async () => {
    const dir = await window.epoch.selectDeviceBackupDestination();
    if (dir) setDestDir(dir);
  };

  const handlePull = async (password: string) => {
    if (!sourceId || !selectedDevice || !destDir) return;
    setPhase('pulling');
    setPullProgress([]);
    setPullError(null);
    try {
      await window.epoch.pullDeviceBackup(sourceId, selectedDevice, destDir, password);
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
    homebrewFallbackAvailable,
    devices,
    selectedDevice,
    setSelectedDevice,
    destDir,
    pullProgress,
    pullError,
    runCompileFromSource,
    runHomebrewInstall,
    handleSelectDestination,
    handlePull,
    checkAvailability,
  };
}