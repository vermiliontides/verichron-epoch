import React from 'react';
import { cn } from '../../libs/utils';

interface ViewLayoutProps {
  /** The view's one page title (DESIGN.md §2, `text-display`). */
  title: React.ReactNode;
  /** Inline beside the title, e.g. a count. */
  titleAside?: React.ReactNode;
  /** One line under the title. */
  description?: React.ReactNode;
  /** `readable` caps the width for form-like views; the left edge never moves. */
  width?: 'full' | 'readable';
  /** Applied to the content below the header (e.g. `gap-7`, `overflow-hidden`). */
  className?: string;
  children: React.ReactNode;
}

/**
 * The frame of every sidebar-navigated view (EPOCH-464). The gutter belongs
 * to the app shell's content area alone; a view sets no outer padding or
 * margin of its own, so the content edge and the title sit in the same place
 * on every view (DESIGN.md §6).
 */
export function ViewLayout({ title, titleAside, description, width = 'full', className, children }: ViewLayoutProps) {
  return (
    <div className={cn('flex flex-col flex-1 min-h-0', width === 'readable' && 'w-full max-w-4xl')}>
      <header className="mb-6 shrink-0">
        <h1 className="font-display text-display text-accent flex items-baseline gap-2">
          {title}
          {titleAside}
        </h1>
        {description && <p className="text-data text-muted-foreground mt-2">{description}</p>}
      </header>
      <div className={cn('flex flex-col flex-1 min-h-0', className)}>{children}</div>
    </div>
  );
}
