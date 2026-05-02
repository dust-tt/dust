import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function assertNever(x: never): never {
  throw new Error(`${x} is not of type never. This should never happen.`);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes a string for search comparison by:
 * 1. Decomposing accented characters (NFD normalization)
 * 2. Removing diacritic marks (so "é" becomes "e", "ü" becomes "u", etc.)
 * 3. Converting to lowercase
 *
 * This allows searching "seb" to match "Sébastien".
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
