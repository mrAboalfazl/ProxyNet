import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Matches the utility used by shadcn/ui components.  We do not depend on a
// Tailwind build step, but keeping this contract makes components portable.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
