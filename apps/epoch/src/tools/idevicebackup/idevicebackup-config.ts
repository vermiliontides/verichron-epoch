// apps/epoch/src/main/tools/idevicebackup2-config.ts
import { ToolDefinition } from './tool-types';

export const IDEVICEBACKUP2_TOOL: ToolDefinition = {
  id: 'idevicebackup2',
  name: 'iOS Device Backup Tool',
  description: 'Create encrypted backups of iOS devices for forensic analysis',
  version: '1.3.0',
  category: 'device-backup',
  
  // Platform-specific release info
  releases: {
    darwin: {
      arch: ['arm64', 'x86_64'],
      // Pre-built from libimobiledevice-win32 project
      downloadUrl: 'https://github.com/libimobiledevice-win32/libimobiledevice-macosx/releases/download/v1.3.0/libimobiledevice-macosx-{arch}.tar.gz',
      extractSubdir: 'bin', // Extract to this subdir
      checksum: {
        'arm64': 'sha256:abc123...',
        'x86_64': 'sha256:def456...'
      }
    },
    linux: {
      arch: ['x86_64'],
      downloadUrl: 'https://github.com/libimobiledevice/libimobiledevice/releases/download/1.3.0/libimobiledevice-linux-x86_64.tar.gz',
      extractSubdir: 'bin',
      checksum: {
        'x86_64': 'sha256:ghi789...'
      }
    },
    win32: {
      arch: ['x86_64'],
      downloadUrl: 'https://github.com/libimobiledevice-win32/imobiledevice-net/releases/download/v1.3.0/libimobiledevice-win32.zip',
      extractSubdir: '',
      checksum: {
        'x86_64': 'sha256:jkl012...'
      }
    }
  },

  // Executables and libraries required
  artifacts: {
    executables: [
      {
        name: 'idevicebackup2',
        platforms: ['darwin', 'linux', 'win32'],
        required: true
      }
    ],
    libraries: [
      {
        name: 'libimobiledevice',
        platforms: ['darwin', 'linux', 'win32'],
        variants: {
          darwin: ['libimobiledevice.dylib'],
          linux: ['libimobiledevice.so.6'],
          win32: ['imobiledevice.dll']
        },
        required: true
      },
      {
        name: 'libplist',
        platforms: ['darwin', 'linux', 'win32'],
        variants: {
          darwin: ['libplist.dylib'],
          linux: ['libplist.so.3'],
          win32: ['plist.dll']
        },
        required: true
      },
      {
        name: 'libusbmuxd',
        platforms: ['darwin', 'linux', 'win32'],
        variants: {
          darwin: ['libusbmuxd.dylib'],
          linux: ['libusbmuxd.so.6'],
          win32: ['usbmuxd.dll']
        },
        required: true
      }
    ]
  },

  // Post-install setup
  postInstall: {
    // macOS code signing
    darwin: [
      {
        type: 'codesign',
        files: ['idevicebackup2'],
        identity: '-' // Ad-hoc signing
      }
    ],
    // Linux: make files executable
    linux: [
      {
        type: 'chmod',
        files: ['idevicebackup2'],
        mode: 0o755
      }
    ],
    // Windows: register DLLs if needed
    win32: [
      {
        type: 'register-dll',
        files: ['imobiledevice.dll', 'plist.dll', 'usbmuxd.dll'],
        optional: true
      }
    ]
  }
};