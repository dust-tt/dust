import { useRouter } from "next/router";
import { useEffect } from "react";
import { useBeforeunload } from "react-beforeunload";

export function useRegisterUnloadHandlers(
  editorDirty,
  unloadWarning = "You have edited your dataset but not saved your changes. Do you really want to leave this page?"
) {
  // Add handlers for browser navigation (typing in address bar, refresh, back button).
  useBeforeunload((event) => {
    if (editorDirty) {
      event.preventDefault();
      // Most browsers no longer support custom messages, but for those that do, we return the
      // warning.
      return unloadWarning;
    }
  });

  // Add handler for next.js router events that don't load a new page in the browser.
  const router = useRouter();
  useEffect(() => {
    const confirmBrowseAway = () => {
      if (!editorDirty) return;
      if (window.confirm(unloadWarning)) return;

      router.events.emit("routeChangeError");
      throw "routeChange aborted.";
    };

    router.events.on("routeChangeStart", confirmBrowseAway);

    return () => {
      router.events.off("routeChangeStart", confirmBrowseAway);
    };
  }, [editorDirty, router, unloadWarning]);
}
