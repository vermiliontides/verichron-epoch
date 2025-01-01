// apps/epoch/src/main/tools/tool-types.ts
export interface ToolArtifact {
  name: string;
  platforms: ('darwin' | 'linux' | 'win32')[];
  required: boolean;
}

export interface ExecutableArtifact extends ToolArtifact {
  // Run as subprocess
}

export interface LibraryArtifact extends ToolArtifact {
  variants: Record<string, string[]>;
}

export interface PostInstallStep {
  type: 'codesign' | 'chmod' | 'register-dll' | 'run-script';
  files?: string[];
  mode?: number;
  identity?: string;
  optional?: boolean;
  command?: string;
}

export interface PlatformRelease {
  arch: string[];
  downloadUrl: string;
  extractSubdir: string;
  checksum: Record<string, string>;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  
  releases: Record<string, PlatformRelease>;
  artifacts: {
    executables: ExecutableArtifact[];
    libraries: LibraryArtifact[];
  };
  postInstall: Record<string, PostInstallStep[]>;
}
