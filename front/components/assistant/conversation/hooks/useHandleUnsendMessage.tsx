import type { NextRouter } from "next/router";
import { useEffect } from "react";

import { isDevelopment } from "@app/types";

interface UseHandleUnsentMessageProps {
  getUserTextWithoutMentions: () => string;
  router: NextRouter;
}

const THRESHOLD_TEXT_LENGTH = 20;

export function useHandleUnsentMessage({
  getUserTextWithoutMentions,
  router,
}: UseHandleUnsentMessageProps) {
  // This handles page reload.
  useEffect(() => {
    // You cannot customize the warning message for page navigation.
    const handleBeforeReload = (e: BeforeUnloadEvent) => {
      const userInput = getUserTextWithoutMentions();

      if (!isDevelopment() && userInput.length > THRESHOLD_TEXT_LENGTH) {
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleBeforeReload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeReload);
    };
  }, [getUserTextWithoutMentions]);

  // This handles router navigation.
  useEffect(() => {
    // Handle custom event for shallow navigation
    const handleBeforeNavigationChange = () => {
      // we should do not trigger this when you post a new message (which causes the router navigation).
      if (router.query.cId === 'new') {
        return;
      }

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
