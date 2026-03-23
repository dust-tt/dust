import { useEffect } from "react";

/**
 * Sets `document.title` reactively. Restores the previous title on unmount.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
