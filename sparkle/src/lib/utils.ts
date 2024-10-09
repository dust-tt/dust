import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { useCallback, useState } from "react";
import { twMerge } from "tailwind-merge";

export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export function assertNever(x: never): never {
  throw new Error(`${x} is not of type never. This should never happen.`);
}

export function useCopyToClipboard(
  resetInterval = 2000
): [isCopied: boolean, copy: (d: ClipboardItem) => Promise<boolean>] {
  const [isCopied, setCopied] = useState(false);

  const copy = useCallback(
    async (d: ClipboardItem) => {
      if (!navigator?.clipboard) {
        console.warn("Clipboard not supported");
        return false;
      }
      try {
        await navigator.clipboard.write([d]);
        setCopied(true);
        setTimeout(() => setCopied(false), resetInterval);
        return true;
      } catch (error) {
        console.warn("Copy failed", error);
        setCopied(false);
        return false;
      }
    },
    [resetInterval]
  );

  return [isCopied, copy];
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
