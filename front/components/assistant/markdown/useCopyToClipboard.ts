import { useCallback, useState } from "react";

export function useCopyToClipboard(
  resetInterval: number = 2000
): [
  isCopied: boolean,
  copy: (d: ClipboardItem | string | number) => Promise<boolean>,
] {
  const [isCopied, setCopied] = useState(false);

  const copy = useCallback(
    async (d: ClipboardItem | string | number) => {
      if (!navigator?.clipboard) {
        console.warn("Clipboard not supported");
        return false;
      }
      try {
        const item: ClipboardItem =
          typeof d === "string" || typeof d === "number"
            ? new ClipboardItem({
                "text/plain": new Blob([`${d}`], { type: "text/plain" }),
              })
            : d;

        await navigator.clipboard.write([item]);
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
