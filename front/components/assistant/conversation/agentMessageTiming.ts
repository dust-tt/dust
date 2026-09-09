export function getLatestHandoffDescendantCompletedTs(
  originMessageId: string,
  messages: Array<{
    sId: string;
    parentAgentMessageId: string | null;
    completedTs: number | null;
  }>
): number | null {
  const children = messages.filter(
    (m) => m.parentAgentMessageId === originMessageId
  );
  if (children.length === 0) {
    return null;
  }

  let latest: number | null = null;
  for (const child of children) {
    const nested = getLatestHandoffDescendantCompletedTs(child.sId, messages);
    const candidate = nested ?? child.completedTs;
    if (candidate !== null && (latest === null || candidate > latest)) {
      latest = candidate;
    }
  }
  return latest;
}

/**
 * @cc [owner:frankaloia,label:product] handoff-header-uses-child-time
 * When a parent agent has handed off, the header timestamp MUST be the latest
 * handoff descendant's `completedTs` once that child has finished. Showing the
 * parent's own completion time MUST NOT happen after a descendant has completed,
 * because that is the first loop, not when the user-visible answer arrived.
 * Handoff children whose parent is visible MUST NOT show their own header timestamp.
 */
export function getAgentMessageHeaderTimestampMs({
  created,
  completedTs,
  messageId,
  parentAgentVisible,
  hasHandedOver,
  messages,
}: {
  created: number;
  completedTs: number | null;
  messageId: string;
  parentAgentVisible: boolean;
  hasHandedOver: boolean;
  messages: Array<{
    sId: string;
    parentAgentMessageId: string | null;
    completedTs: number | null;
  }>;
}): number | undefined {
  if (parentAgentVisible) {
    return undefined;
  }

  if (hasHandedOver) {
    return (
      getLatestHandoffDescendantCompletedTs(messageId, messages) ??
      completedTs ??
      created
    );
  }

  return completedTs ?? created;
}
