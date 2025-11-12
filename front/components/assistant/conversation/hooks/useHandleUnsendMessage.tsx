import type { NextRouter } from "next/router";
import { useEffect } from "react";

import { isDevelopment } from "@app/types";

interface useHandleUnsentMessageProps {
  getUserTextWithoutMentions: () => string;
  router: NextRouter;
}

const THRESHOLD_TEXT_LENGTH = 20;

export function useHandleUnsentMessage({
  getUserTextWithoutMentions,
  router,
}: useHandleUnsentMessageProps) {
  // This handles page reload.
  useEffect(() => {
    // You cannot customize the warning message for page navigation.
    const handleBeforeReload = (e: BeforeUnloadEvent) => {
      const userInput = getUserTextWithoutMentions();

      if (!isDevelopment() && userInput.length > THRESHOLD_TEXT_LENGTH) {
        e.preventDefault();
        window.confirm();
      }
    };

    window.addEventListener("beforeunload", handleBeforeReload);

    return () => {
      window.addEventListener("beforeunload", handleBeforeReload);
    };
  }, [getUserTextWithoutMentions]);

  // This handles router navigation.
  useEffect(() => {
    // Handle custom event for shallow navigation
    const handleBeforeNavigationChange = () => {
      const userInput = getUserTextWithoutMentions();

      if (!isDevelopment() && userInput.length > THRESHOLD_TEXT_LENGTH) {
        const shouldProceed = window.confirm(
          `Your message hasn't been sent. Are you sure you want to leave this conversation?`
        );
        if (!shouldProceed) {
          // Not ideal but I cannot find the other way to cancel the route navigation.
          throw "Abort route change. User cancelled navigation.";
        }
      }
    };

    router.events.on("beforeHistoryChange", handleBeforeNavigationChange);

    return () => {
      router.events.off("beforeHistoryChange", handleBeforeNavigationChange);
    };
  }, [getUserTextWithoutMentions, router]);
}
