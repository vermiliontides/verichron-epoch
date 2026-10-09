import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader } from './Loader';

interface EmptyStateProps {
  /** Shown above the title; omit when `loading`. */
  icon?: LucideIcon;
  title: string;
  detail?: React.ReactNode;
  /** A spinner in place of the icon, for "still loading" rather than "nothing here". */
  loading?: boolean;
}

/**
 * What a view or panel shows when it has no data to show: nothing selected,
 * nothing loaded yet, or nothing found (EPOCH-464, DESIGN.md §6). One look
 * everywhere: centered in the space it fills, an icon (or spinner) in an
 * accent chip, the state in one line, and an optional muted detail. Errors are not empty states; they use the
 * flag banner (§1).
 */
export function EmptyState({ icon: Icon, title, detail, loading = false }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-16">
      {/* The accent icon chip, as on New Investigation's panels (§1: elevation, not borders). */}
      <div className="mb-2 p-3 rounded-full bg-accent/10 text-accent shadow-elevation-1">
        {loading ? <Loader size="md" label={title} /> : Icon && <Icon size="1.5rem" strokeWidth={1.5} />}
      </div>
      <p className="text-data text-foreground">{title}</p>
      {detail && <p className="text-data font-mono text-muted-foreground max-w-xl">{detail}</p>}
    </div>
  );
}
