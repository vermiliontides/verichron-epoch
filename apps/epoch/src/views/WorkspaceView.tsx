import React, { useState } from 'react';
import { FolderOpen, HardDrive, Play, AlertCircle } from 'lucide-react';
import { Badge } from '../components/ui/Badge';


interface WorkspaceViewProps {
  onPipelineStarted: () => void;
}

export function WorkspaceView({ onPipelineStarted }: WorkspaceViewProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const handleSelectDirectory = async () => {
    const path = await window.epoch.selectBackupDirectory();
    if (path) {
      setSelectedPath(path);
    }
  };

  const handleStartPipeline = async () => {
    if (!selectedPath) return;
    setIsStarting(true);
    try {
      await window.epoch.startPipeline(selectedPath);
      onPipelineStarted(); // Route them to the Runs view automatically
    } catch (err) {
      console.error('Failed to start pipeline:', err);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-8 max-w-4xl mx-auto w-full justify-center min-h-full">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-foreground mb-2">New Investigation</h1>
        <p className="text-sm text-muted-foreground">Select an existing mobile backup, iLEAPP extraction, or raw filesystem dump to begin analysis.</p>
      </div>

      <div 
        onClick={handleSelectDirectory}
        className="group relative flex flex-col items-center justify-center p-12 border-2 border-dashed border-border rounded-xl bg-surface/30 hover:bg-surface/60 hover:border-accent transition-all cursor-pointer mb-6"
      >
        <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />
        
        <div className="bg-surface p-4 rounded-full border border-border shadow-sm group-hover:scale-110 group-hover:border-accent/50 transition-all mb-4">
          <FolderOpen size="2rem" className="text-muted-foreground group-hover:text-accent transition-colors" />
        </div>
        
        <h3 className="font-display text-lg font-medium text-foreground mb-1">Import Directory</h3>
        <p className="text-sm text-muted-foreground font-mono mb-4 text-center max-w-md">
          macOS: ~/Library/Application Support/MobileSync/Backup/<br />
          Windows: %appdata%\Apple Computer\MobileSync\Backup\
        </p>
        
        <Badge variant="neutral">Browse Local Files</Badge>
      </div>

      {selectedPath && (
        <div className="bg-surface border border-border rounded-lg p-5 shadow-sm animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden pr-4">
              <HardDrive className="text-accent shrink-0" size="1.25rem" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Target Path</p>
                <p className="text-sm font-mono text-foreground truncate" title={selectedPath}>
                  {selectedPath}
                </p>
              </div>
            </div>
            
            <button
              onClick={handleStartPipeline}
              disabled={isStarting}
              className="flex items-center gap-2 bg-accent text-background hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-md font-medium text-sm transition-colors shrink-0"
            >
              {isStarting ? (
                <>
                  <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play size="1rem" fill="currentColor" />
                  Run Pipeline
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <AlertCircle className="text-blue-400 shrink-0 mt-0.5" size="1rem" />
        <p className="text-xs text-blue-300 leading-relaxed">
          <strong>Tip:</strong> Live device extraction over USB is currently disabled. Please use an external tool (like Finder, iTunes, or libimobiledevice) to stage the evidence before running Verichron.
        </p>
      </div>
    </div>
  );
}