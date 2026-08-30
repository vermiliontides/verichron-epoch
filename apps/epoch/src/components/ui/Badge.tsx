import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-mono font-medium',
  {
    variants: {
      variant: {
        accent: 'bg-accent/15 text-accent',
        flag: 'bg-flag/20 text-flag',
        neutral: 'bg-surface text-muted-foreground border border-border',
        // pipeline_stage_status.status CHECK constraint values
        pending: 'bg-muted-foreground/10 text-muted-foreground',
        running: 'bg-flag/15 text-flag',
        succeeded: 'bg-accent/15 text-accent',
        failed: 'bg-flag/25 text-flag font-semibold',
        skipped: 'bg-muted-foreground/8 text-muted-foreground',
        // pipeline_runs has no status column -- this is the derived
        // two-state phase (finished_at set or not), not a success claim.
        in_progress: 'bg-flag/15 text-flag',
        finished: 'bg-accent/15 text-accent',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}