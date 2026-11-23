import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  default: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
  success: 'bg-success/15 text-success',
  danger: 'bg-destructive/10 text-destructive',
} as const;

export function Badge({ className, tone = 'default', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)} {...props} />;
}
