import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes safely.
 * Combines clsx for conditional classes and tailwind-merge to handle conflicts.
 * 
 * @param inputs - Array of class values (strings, objects, arrays, etc.)
 * @returns A single string of merged Tailwind classes.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
