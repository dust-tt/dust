import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  useCurrentlyRenderedData,
  useVirtuosoLocation,
  useVirtuosoMethods,
} from "@virtuoso.dev/message-list";
import type { CSSProperties, ReactNode } from "react";
import { forwardRef, useEffect, useRef } from "react";

export function customSmoothScroll() {
  return {
    animationFrameCount: 30,
    easing: (x: number) => 1 - Math.pow(1 - x, 5),
  };
}

interface ConversationScrollFooterProps {
  context: VirtuosoMessageListContext;
}

interface ConversationScrollFooterWrapperProps {
  children: ReactNode;
  style: CSSProperties;
}

// The spacer contributes scroll range, not viewport chrome. A boxless wrapper
// keeps Virtuoso from subtracting its height from the visible message area.
export const ConversationScrollFooterWrapper = forwardRef<
  HTMLDivElement,
  ConversationScrollFooterWrapperProps
>(function ConversationScrollFooterWrapper({ children, style }, ref) {
  return (
    <div ref={ref} style={{ ...style, display: "contents" }}>
      {children}
    </div>
  );
});

/**
 * @cc [owner:aubin-tchoi,label:product] bounded-send-scroll-space
 * A new scrollAnchor request must align its message to the top once measured.
 * The footer must reserve only the unused viewport below that turn, shrinking
 * as replies grow, without reducing the visible message area or scrolling again
 * on streaming updates or server ID reconciliation.
 */
export function ConversationScrollFooter({
  context,
}: ConversationScrollFooterProps) {
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  // Recompute after both data changes and Virtuoso's row measurements.
  useCurrentlyRenderedData<VirtuosoMessage>();
  const { visibleListHeight } = useVirtuosoLocation();
  const scrolledRequestRef = useRef<string | null>(null);
  const { scrollAnchor, useWindowScroll } = context;
  // A mobile send also scrolls any content above the list out of view.
  const topOffset =
    useWindowScroll && scrollAnchor
      ? Math.max(0, methods.scrollerElement()?.getBoundingClientRect().top ?? 0)
      : 0;
  const availableHeight = visibleListHeight + topOffset;

  const messages = methods.data.get();
  const anchorIndex = scrollAnchor
    ? messages.findIndex((message) => message.rank === scrollAnchor.rank)
    : -1;
  let trailingHeight = 0;
  // height() looks up each item in the list. Stop as soon as the viewport is
  // filled so loaded history does not require measuring every message.
  for (
    let index = Math.max(0, anchorIndex);
    index < messages.length && trailingHeight < availableHeight;
    index++
  ) {
    trailingHeight += methods.height(messages[index]);
  }
  const height = Math.max(0, availableHeight - trailingHeight);
  const requestId = scrollAnchor?.requestId;

  useEffect(() => {
    if (
      !requestId ||
      scrolledRequestRef.current === requestId ||
      anchorIndex < 0 ||
      availableHeight === 0 ||
      trailingHeight === 0
    ) {
      return;
    }

    // Let the measured spacer reach the DOM before scrolling. Native "start"
    // alignment adds its own padding, which double-counts the sticky composer.
    const frame = requestAnimationFrame(() => {
      scrolledRequestRef.current = requestId;
      methods.scrollToItem({
        index: anchorIndex,
        align: "start-no-overflow",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : customSmoothScroll,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [anchorIndex, availableHeight, methods, requestId, trailingHeight]);

  return <div aria-hidden style={{ height }} />;
}
