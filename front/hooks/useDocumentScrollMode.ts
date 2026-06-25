import { useEffect } from "react";

/** Mobile-only: toggles `document-scroll-mode` on `<body>`. See global.css. */
export function useDocumentScrollMode(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    document.body.classList.add("document-scroll-mode");

    return () => {
      document.body.classList.remove("document-scroll-mode");
    };
  }, [enabled]);
}
