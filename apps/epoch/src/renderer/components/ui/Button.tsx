/**
 * Shared button primitive (EPOCH-203 / VER-10).
 *
 * Extracted from the button treatments already duplicated across the app:
 *   - accent   -- the primary-CTA fill used for "Prepare evidence",
 *                 "Run forensic analysis on N backups", "View investigation",
 *                 "Install with Homebrew", the password-modal "Continue".
 *   - outline  -- the surface-raised secondary treatment used for "Change",
 *                 "Check again", "Choose destination"/"Change destination".
 *   - ghost    -- the bare-text tertiary treatment used for the advanced-
 *                 settings disclosure toggle (no background, no padding,
 *                 color-only hover). Deliberately does NOT also cover
 *                 "Try again" (accent-colored, underlines on hover) or the
 *                 "Select all" / "Select none" segmented pill toggle in
 *                 WorkspaceView.tsx -- both read as distinct controls (a
 *                 link and a compound segmented control, respectively)
 *                 rather than restatements of this variant, and forcing
 *                 them through the same API would blur that difference.
 *                 Left for a follow-up pass; see VER-10 ticket comment.
 *   - danger   -- new. No shared destructive-button treatment existed
 *                 anywhere in the app prior to this ticket. Built on the
 *                 existing `--danger` token using the same solid-fill rule
 *                 `accent` already follows (colored bg + the `--background`
 *                 token for text, since both `--accent` and `--danger` sit
 *                 at a similar mid-high HSL lightness and need the same
 *                 dark-text contrast fix).
 *
 * Deliberately NOT built on Radix `Slot`/`asChild` composition -- `Badge.tsx`
 * already established a plain `cva`-only variant pattern for this app, and
 * EPOCH-201's ordering note (VER-8) asks this ticket to reuse whatever
 * pattern governs `Badge.tsx` rather than inventing a second one. If a
 * future ticket needs a button that renders as a link, that's an additive
 * `asChild` prop on this file later, not a rewrite.
 *
 * Loading state renders `Loader` (see ./Loader.tsx) inheriting
 * `currentColor` rather than taking a color prop. Every existing spinner in
 * the app (`border-background`, `border-flag`, `border-accent` variants) was
 * already just matching whatever text color surrounded it -- this component
 * sets that text color per `variant`, so the spinner needs no color of its
 * own to stay in sync.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../../shared/lib/utils';
import { Loader } from './Loader';

const buttonVariants = cva(
  // text-label here, not per-compoundVariant text-sm/text-xs: button text is
  // UI chrome (DESIGN.md §2), and Button is the highest-leverage place to
  // get that right since every future call site inherits whatever this
  // file does. Note: text-label has no size variant, so `size` now only
  // differentiates padding, not text size -- see VER-10 comment.
  'inline-flex items-center justify-center gap-2 rounded-lg text-label transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
  {
    variants: {
      variant: {
        accent: 'bg-accent text-background shadow-elevation-2 hover:bg-accent/90 active:scale-[0.99]',
        outline:
          'bg-surface-raised shadow-elevation-1 hover:shadow-elevation-2 text-foreground hover:text-accent active:scale-[0.99]',
        ghost: 'text-muted-foreground hover:text-foreground',
        danger: 'bg-danger text-background shadow-elevation-2 hover:bg-danger/90 active:scale-[0.99]',
      },
      size: {
        default: '',
        sm: '',
      },
    },
    compoundVariants: [
      { variant: ['accent', 'outline', 'danger'], size: 'default', class: 'px-4 py-2.5' },
      { variant: ['accent', 'outline', 'danger'], size: 'sm', class: 'px-3 py-1.5' },
    ],
    defaultVariants: {
      variant: 'accent',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button. Mirrors the current
   * "Prepare evidence" -> "Running..." pattern in WorkspaceView.tsx. */
  loading?: boolean;
  /** Content shown in place of `children` while `loading` is true, e.g.
   * "Running..." for "Prepare evidence". Falls back to `children`. */
  loadingText?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, loadingText, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader size={size === 'sm' ? 'sm' : 'md'} />}
        {loading ? loadingText ?? children : children}
      </button>
    );
  }
);
Button.displayName = 'Button';