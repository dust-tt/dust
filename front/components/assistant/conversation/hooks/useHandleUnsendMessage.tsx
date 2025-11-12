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
    const handleBeforeNavigationChange = (
      url: string,
      { shallow }: { shallow: boolean }
    ) => {
      // We should do not trigger this when you post a new message (which causes the router navigation),
      // but this also disable the confirmation dialog when you go to a different conversation from a new conversation.
      // TODO (yuka 12th nov): fix this logic and only disable it when you post a message as a new conversation
      if (router.query.cId === "new" && shallow) {
        return;
      }

      const userInput = getUserTextWithoutMentions();

      if (!isDevelopment() && userInput.length > THRESHOLD_TEXT_LENGTH) {
        const shouldProceed = window.confirm(
          `Your message hasn't been sent. Are you sure you want to leave this conversation?`
        );
        if (!shouldProceed) {
          // We need to emit this to stop loading animation spinner
          router.events.emit("routeChangeError");
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
