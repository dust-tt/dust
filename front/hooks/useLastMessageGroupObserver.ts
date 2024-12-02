import type { MessageWithContentFragmentsType } from "@dust-tt/types";
import { useEffect } from "react";

import { LAST_MESSAGE_GROUP_ID } from "@app/components/assistant/conversation/MessageGroup";

/**
 * A custom hook to observe when the last message group element becomes visible or not.
 */
export function useLastMessageGroupObserver(
  messages: MessageWithContentFragmentsType[][]
) {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          // Adjust the minHeight based on the intersecting status.
          if (!entry.isIntersecting) {
            target.style.minHeight = "0px";
          }
        });
      },
      { threshold: 0.25 }
    );

    const element = document.querySelector(`#${LAST_MESSAGE_GROUP_ID}`);
    if (element) {
      observer.observe(element);
      return () => {
        observer.unobserve(element);
      };
    }
    return () => {
      observer.disconnect();
    };
  }, [messages]);
}
