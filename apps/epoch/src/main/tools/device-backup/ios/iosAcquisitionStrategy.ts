import { app } from 'electron';
import path from 'path';
import type { ToolAcquisitionAction, ToolAcquisitionStrategy } from '../../../../shared/types/tools';
import {
  compileFromSourceSteps,
  compileFromSourceStepsViaWsl,
  systemPackageInstallCommand,
  isHomebrewAvailable,
} from './buildSteps';

/** Where a self-compiled or downloaded idevicebackup2 ends up, and where
 * detectBinary()'s bundled-path check should look. One app-owned location
 * regardless of how the binary got there -- pre-bundled with a release,
 * compiled from source, or downloaded-and-verified all land here. */
export function idevicebackup2InstallPrefix(): string {
  return path.join(app.getPath('userData'), 'tools', 'idevicebackup2');
}

function buildScratchDir(): string {
  return path.join(app.getPath('temp'), 'verichron-idevicebackup2-build');
}

export class IosToolAcquisitionStrategy implements ToolAcquisitionStrategy {
  availableActions(): ToolAcquisitionAction[] {
    const installPrefix = idevicebackup2InstallPrefix();
    const buildDir = buildScratchDir();

    const systemPackagesStep: ToolAcquisitionAction = {
      kind: 'install-instructions',
      title: 'Install build tools (one-time, needs administrator privileges)',
      commands: [systemPackageInstallCommand(process.platform)],
    };

    if (process.platform === 'win32') {
      return [
        systemPackagesStep,
        {
          kind: 'compile-from-source',
          title: 'Compile idevicebackup2 via WSL',
          steps: compileFromSourceStepsViaWsl(buildDir, installPrefix),
        },
        {
          kind: 'download-verified-release',
          title: 'Download a VeriChron-built release (checksum-verified)',
          manifestUrl: 'hosted-release-manifest', // resolved via hostedReleaseManifestFor()
        },
      ];
    }

    const actions: ToolAcquisitionAction[] = [];

    // macOS: offer Homebrew first when it's present. This is the fix for
    // the "Fetch libplist source" failure -- rather than the source-build
    // path being the only option and throwing an unhandled error partway
    // through, a working macOS package manager path is offered up front
    // and the source-build path becomes the fallback, not the only route.
    if (process.platform === 'darwin' && isHomebrewAvailable()) {
      actions.push({
        kind: 'homebrew-install',
        title: 'Install via Homebrew (recommended)',
        formulas: ['libplist', 'libimobiledevice'],
      });
    }

    actions.push(systemPackagesStep, {
      kind: 'compile-from-source',
      title: 'Compile idevicebackup2 from source',
      steps: compileFromSourceSteps(buildDir, installPrefix),
    });

    return actions;
  }
}
