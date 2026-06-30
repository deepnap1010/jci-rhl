// client/src/lib/utils.ts
// cn(): merge conditional + conflicting Tailwind classes safely.
// clsx handles conditionals; twMerge resolves conflicts (last wins),
// so cn('px-2', cond && 'px-4') → 'px-4' instead of both.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}