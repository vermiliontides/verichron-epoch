import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-2xs font-mono font-medium tracking-tight border transition-colors',
  {
    variants: {
      variant: {
        accent: 'bg-accent/10 text-accent border-accent/25',
        success: 'bg-success/10 text-success border-success/30',
        flag: 'bg-flag/10 text-flag border-flag/30',
        danger: 'bg-danger/15 text-danger border-danger/40 font-semibold',
        neutral: 'bg-surface text-muted-foreground border-border',
        subtle: 'bg-surface-raised/80 text-foreground/80 border-border-subtle',
        threat: 'bg-danger/20 text-danger border-danger/50 font-bold uppercase tracking-wider',
        // pipeline_stage_status.status CHECK constraint values
        pending: 'bg-surface text-muted-foreground/70 border-border/60',
        running: 'bg-accent/10 text-accent border-accent/30',
        succeeded: 'bg-success/10 text-success border-success/30',
        failed: 'bg-danger/15 text-danger border-danger/40 font-semibold',
        skipped: 'bg-surface text-muted-foreground/60 border-border-subtle',
        // pipeline_runs phase
        in_progress: 'bg-accent/10 text-accent border-accent/30',
        finished: 'bg-success/10 text-success border-success/30',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
}

export function Badge({ className, variant, dot, pulse, children, ...props }: BadgeProps) {
  const showDot = dot || variant === 'running' || variant === 'in_progress';
  const showPulse = pulse || variant === 'running' || variant === 'in_progress';

  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {showDot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {showPulse && (
            <span
              className={cn(
                'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                variant === 'danger' || variant === 'threat'
                  ? 'bg-danger'
                  : variant === 'flag'
                  ? 'bg-flag'
                  : 'bg-accent'
              )}
            />
          )}
          <span
            className={cn(
              'relative inline-flex rounded-full h-1.5 w-1.5',
              variant === 'danger' || variant === 'threat'
                ? 'bg-danger'
                : variant === 'flag'
                ? 'bg-flag'
                : variant === 'success' || variant === 'succeeded'
                ? 'bg-success'
                : 'bg-accent'
            )}
          />
        </span>
      )}
      {children}
    </span>
  );
}