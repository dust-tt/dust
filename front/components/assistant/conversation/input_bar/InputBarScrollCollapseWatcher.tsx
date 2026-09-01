import { useVirtuosoLocation } from "@virtuoso.dev/message-list";
import { useEffect } from "react";

interface InputBarScrollCollapseWatcherProps {
  onListOffsetChange: (listOffset: number) => void;
}

/**
 * Feeds the conversation's scroll offset to useInputBarCompactMode.
 *
 * useVirtuosoLocation re-renders its host on every scroll frame, so the
 * subscription lives here rather than in AgentInputBar: this component renders
 * nothing, while AgentInputBar renders the whole composer plus a Framer Motion
 * layout animation that would re-project on each of those frames.
 */
export function InputBarScrollCollapseWatcher({
  onListOffsetChange,
}: InputBarScrollCollapseWatcherProps) {
  const { listOffset } = useVirtuosoLocation();

  useEffect(() => {
    onListOffsetChange(listOffset);
  }, [listOffset, onListOffsetChange]);

  return null;
}
