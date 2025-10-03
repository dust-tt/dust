import type { VirtuosoMessageListProps } from "@virtuoso.dev/message-list";
import {
  useCurrentlyRenderedData,
  useVirtuosoLocation,
} from "@virtuoso.dev/message-list";

import { MessageDateIndicator } from "@app/components/assistant/conversation/MessageDateIndicator";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";

export const StickyHeaderVirtuoso: VirtuosoMessageListProps<
  VirtuosoMessage,
  VirtuosoMessageListContext
>["StickyHeader"] = () => {
  const firstItem = useCurrentlyRenderedData<VirtuosoMessage>().at(0);
  const location = useVirtuosoLocation();

  // No item in view or full list is visible without scroll.
  if (!firstItem || location.scrollHeight === location.visibleListHeight) {
    return null;
  }
  return (
    <div style={{ width: "100%", position: "absolute", top: 0 }}>
      <MessageDateIndicator message={firstItem} />
    </div>
  );
};
