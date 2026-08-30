import React from 'react';
import type { LucideIcon } from 'lucide-react';
 
interface PlaceholderViewProps {
  title: string;
  icon: LucideIcon;
}
 
export function PlaceholderView({ title, icon: Icon }: PlaceholderViewProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Icon size="1.75rem" strokeWidth={1.5} />
      <p className="font-display text-base">{title}</p>
      <p className="text-xs font-mono">No backend endpoint wired for this view yet.</p>
    </div>
  );
}