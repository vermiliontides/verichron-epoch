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
 * everywhere: centered in the space it fills, a muted icon, the state in one
 * line, and an optional detail. Errors are not empty states; they use the
 * flag banner (§1).
 */
export function EmptyState({ icon: Icon, title, detail, loading = false }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-center py-16">
      {loading ? <Loader size="md" label={title} /> : Icon && <Icon size="1.5rem" strokeWidth={1.5} />}
      <p className="text-data">{title}</p>
      {detail && <p className="text-data font-mono opacity-80 max-w-xl">{detail}</p>}
    </div>
  );
}
