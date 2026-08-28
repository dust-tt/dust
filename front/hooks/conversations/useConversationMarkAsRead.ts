import { usePodConversationsSummary } from "@app/hooks/conversations/usePodConversations";
import { clientFetch } from "@app/lib/egress/client";
import logger from "@app/logger/logger";
import type { PatchConversationsRequestBody } from "@app/types/api/assistant/conversation/types";
import type {
  ConversationListItemType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { useEffect } from "react";

import { useConversation } from "./useConversation";
import { useConversations } from "./useConversations";

const DELAY_BEFORE_MARKING_AS_READ_MS = 2000;

// Mark-as-read requests are debounced and deduplicated at module level: the components
// that trigger them (ConversationViewer, its SSE handlers) mount and unmount constantly,
// so per-instance timers and dedup state would reset mid-burst and re-send the same
// PATCH many times over.

type PendingMark = {
  workspaceId: string;
  // Highest activity timestamp this mark must cover.
  activityAtMs: number;
  // null while parked because the tab is hidden.
  timeoutId: ReturnType<typeof setTimeout> | null;
};

const pendingByConversationId = new Map<string, PendingMark>();

// Highest activity timestamp already covered, either by a successful PATCH or by the
// server-reported `lastReadAt` observed on fetched conversations.
const coveredUpToMsByConversationId = new Map<string, number>();

function recordConversationReadUpTo(
  conversationId: string,
  readUpToMs: number
): void {
  coveredUpToMsByConversationId.set(
    conversationId,
    Math.max(coveredUpToMsByConversationId.get(conversationId) ?? 0, readUpToMs)
  );
}

// Conversations this session can no longer access (403/404): a stale tab would
// otherwise retry them forever.
const inaccessibleConversationIds = new Set<string>();

type MarkedAsReadListener = (conversationId: string) => void;
const markedAsReadListeners = new Set<MarkedAsReadListener>();

function subscribeToConversationMarkedAsRead(
  listener: MarkedAsReadListener
): () => void {
  markedAsReadListeners.add(listener);
  return () => {
    markedAsReadListeners.delete(listener);
  };
}

let isVisibilityListenerRegistered = false;

// Marks parked while the tab was hidden resume when it becomes visible again.
function registerVisibilityListenerOnce(): void {
  if (isVisibilityListenerRegistered) {
    return;
  }
  isVisibilityListenerRegistered = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    for (const [conversationId, pending] of pendingByConversationId) {
      if (pending.timeoutId === null) {
        pending.timeoutId = setTimeout(
          () => void markAsRead(conversationId),
          DELAY_BEFORE_MARKING_AS_READ_MS
        );
      }
    }
  });
}

export function requestConversationMarkAsRead({
  workspaceId,
  conversationId,
  activityAtMs = Date.now(),
}: {
  workspaceId: string;
  conversationId: string;
  // Timestamp of the activity that must end up covered by `lastReadAt`. Requests whose
  // activity a previous mark already covers are dropped.
  activityAtMs?: number;
}): void {
  if (inaccessibleConversationIds.has(conversationId)) {
    return;
  }

  const pending = pendingByConversationId.get(conversationId);
  if (pending) {
    pending.activityAtMs = Math.max(pending.activityAtMs, activityAtMs);
    if (pending.timeoutId !== null) {
      clearTimeout(pending.timeoutId);
      pending.timeoutId = setTimeout(
        () => void markAsRead(conversationId),
        DELAY_BEFORE_MARKING_AS_READ_MS
      );
    }
    return;
  }

  if (
    activityAtMs <= (coveredUpToMsByConversationId.get(conversationId) ?? 0)
  ) {
    return;
  }

  registerVisibilityListenerOnce();
  pendingByConversationId.set(conversationId, {
    workspaceId,
    activityAtMs,
    timeoutId: setTimeout(
      () => void markAsRead(conversationId),
      DELAY_BEFORE_MARKING_AS_READ_MS
    ),
  });
}

async function markAsRead(conversationId: string): Promise<void> {
  const pending = pendingByConversationId.get(conversationId);
  if (!pending) {
    return;
  }

  // A hidden tab is not reading anything: park until it is visible again.
  if (document.visibilityState === "hidden") {
    pending.timeoutId = null;
    return;
  }

  pendingByConversationId.delete(conversationId);

  // Re-check at flush time: the conversation data (and its `lastReadAt` seed) may have
  // arrived after this mark was scheduled.
  if (
    pending.activityAtMs <=
    (coveredUpToMsByConversationId.get(conversationId) ?? 0)
  ) {
    return;
  }

  try {
    const response = await clientFetch(
      `/api/w/${pending.workspaceId}/assistant/conversations/${conversationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          read: true,
        } satisfies PatchConversationsRequestBody),
      }
    );

    if (!response.ok) {
      if (response.status === 403 || response.status === 404) {
        inaccessibleConversationIds.add(conversationId);
      }
      throw new Error("Failed to mark conversation as read");
    }

    recordConversationReadUpTo(conversationId, pending.activityAtMs);

    for (const listener of markedAsReadListeners) {
      listener(conversationId);
    }
  } catch (error) {
    // Dropped on purpose: the next activity or view schedules a new mark.
    logger.error({ err: error }, "Error marking conversation as read:");
  }
}

export function useConversationMarkAsRead({
  conversation,
  workspaceId,
}: {
  conversation?: ConversationWithoutContentType;
  workspaceId: string;
}): void {
  const { mutateConversations } = useConversations({
    workspaceId,
    options: { disabled: true },
  });

  const { mutate: mutateSpaceSummary } = usePodConversationsSummary({
    workspaceId,
    options: {
      disabled: true,
    },
  });

  // We only need the mutator, to reflect the read state on the open conversation.
  const { mutateConversation } = useConversation({
    conversationId: conversation?.sId ?? null,
    workspaceId,
    options: { disabled: true },
  });

  const conversationSId = conversation?.sId;

  // Depending on the conversation value is deliberate: activity landing while the user
  // views the conversation produces a new object with `unread: true` and a newer
  // `updated`, which must schedule a new mark. Identity churn without new activity is
  // deduplicated on `updated` by the module-level scheduler above.
  useEffect(() => {
    if (!conversation?.sId) {
      return;
    }
    // Server truth: everything up to `lastReadAt` is already read. Seeding lets the
    // scheduler drop replayed SSE events for activity the user has already seen.
    if (conversation.lastReadMs !== null) {
      recordConversationReadUpTo(conversation.sId, conversation.lastReadMs);
    }
    if (conversation.unread) {
      requestConversationMarkAsRead({
        workspaceId,
        conversationId: conversation.sId,
        activityAtMs: conversation.updated,
      });
    }
  }, [workspaceId, conversation]);

  // Reflect successful marks in the SWR caches while mounted.
  useEffect(() => {
    return subscribeToConversationMarkedAsRead((conversationId) => {
      void mutateConversations(
        (prevState: ConversationListItemType[] | undefined) =>
          prevState?.map((c) =>
            c.sId === conversationId
              ? { ...c, unread: false, isRunningAgentLoop: false }
              : c
          ),
        { revalidate: false }
      );

      void mutateSpaceSummary((prevState) => {
        if (!prevState) {
          return prevState;
        }
        const containsConversation = prevState.summary.some(
          (spaceSummary) =>
            spaceSummary.unreadConversations.some(
              ({ sId }) => sId === conversationId
            ) ||
            spaceSummary.nonParticipantUnreadConversationIds.includes(
              conversationId
            )
        );
        if (!containsConversation) {
          return prevState;
        }
        return {
          ...prevState,
          summary: prevState.summary.map((spaceSummary) => ({
            ...spaceSummary,
            unreadConversations: spaceSummary.unreadConversations.filter(
              ({ sId }) => sId !== conversationId
            ),
            nonParticipantUnreadConversationIds:
              spaceSummary.nonParticipantUnreadConversationIds.filter(
                (id) => id !== conversationId
              ),
          })),
        };
      });

      if (conversationId === conversationSId) {
        void mutateConversation(
          (current) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              conversation: {
                ...current.conversation,
                lastReadMs: Date.now(),
                unread: false,
              },
            };
          },
          { revalidate: false }
        );
      }
    });
  }, [
    mutateConversations,
    mutateSpaceSummary,
    mutateConversation,
    conversationSId,
  ]);
}
