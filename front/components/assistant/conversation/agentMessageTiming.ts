type HandoffTimingMessage = {
  sId: string;
  parentAgentMessageId: string | null;
  completedTs: number | null;
};

function indexHandoffChildren(
  messages: HandoffTimingMessage[]
): Map<string, HandoffTimingMessage[]> {
  const childrenByParent = new Map<string, HandoffTimingMessage[]>();
  for (const message of messages) {
    if (!message.parentAgentMessageId) {
      continue;
    }
    const siblings = childrenByParent.get(message.parentAgentMessageId);
    if (siblings) {
      siblings.push(message);
    } else {
      childrenByParent.set(message.parentAgentMessageId, [message]);
    }
  }
  return childrenByParent;
}

function latestDescendantCompletedTs(
  originMessageId: string,
  childrenByParent: Map<string, HandoffTimingMessage[]>
): number | null {
  const children = childrenByParent.get(originMessageId);
  if (!children || children.length === 0) {
    return null;
  }

  let latest: number | null = null;
  for (const child of children) {
    const nested = latestDescendantCompletedTs(child.sId, childrenByParent);
    const candidate = nested ?? child.completedTs;
    if (candidate !== null && (latest === null || candidate > latest)) {
      latest = candidate;
    }
  }
  return latest;
}

export function getLatestHandoffDescendantCompletedTs(
  originMessageId: string,
  messages: HandoffTimingMessage[]
): number | null {
  return latestDescendantCompletedTs(
    originMessageId,
    indexHandoffChildren(messages)
  );
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
  messages: HandoffTimingMessage[];
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
