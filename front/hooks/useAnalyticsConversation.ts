import type { AnalyticsViewInput } from "@app/components/workspace/analytics/analyticsView";
import { describeAnalyticsView } from "@app/components/workspace/analytics/analyticsView";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useRef, useState } from "react";

// Hidden in the panel by its origin, so what the user sees first is @analyst's reply to it.
function openingMessage(view: AnalyticsViewInput): string {
  return `<dust_system>
The user just opened the @analyst panel on the workspace Analytics page.

What they have set up on the page right now:
${describeAnalyticsView(view)}

Do NOT call any tools. Greet briefly, naming the period they chose and, when they have any, each
filter they applied by its name rather than as "the selected filters". Then offer 2-3 example
questions that fit this exact setup.
</dust_system>`;
}

/**
 * Creates and holds the single conversation for the Analytics conversation
 * panel. Creation is eager on panel opening, so the panel shows a live
 * conversation from the start rather than a mocked greeting.
 *
 * At most one conversation is created per hook instance: `startConversation` is
 * a no-op after the first call until `resetConversation` runs. Callers must
 * gate the first call on the panel being open, since it stays mounted while
 * closed.
 */
/**
 * @cc [owner:achilleburah,label:product] opening-message-snapshots-the-view
 * The opening message embeds `view` as it stands when `startConversation` runs, and is never
 * regenerated. Callers MUST NOT start while the filter's display names are still resolving,
 * otherwise the greeting names raw identifiers for the whole life of the conversation. A later
 * change to the view MUST reach the agent through a tool that reads it live.
 */
export function useAnalyticsConversation({
  owner,
  user,
  view,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  view: AnalyticsViewInput;
}) {
  const sendNotification = useSendNotification();

  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [creationFailed, setCreationFailed] = useState(false);
  const hasStartedRef = useRef(false);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const startConversation = useCallback(async () => {
    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;

    setIsCreatingConversation(true);

    const input = openingMessage(viewRef.current);

    const result = await createConversationWithMessage({
      messageData: {
        input,
        mentions: [{ configurationId: GLOBAL_AGENTS_SID.ANALYST }],
        contentFragments: { uploaded: [], contentNodes: [] },
        origin: "analytics_panel",
      },
      // `test` is the hidden state. Becomes visible (`unlisted`) once the user writes, see
      // `promoteAnalyticsPanelConversation`.
      visibility: "test",
      // Without a title, `ensureConversationTitle` would name the conversation after the
      // opening message.
      title: `Ask ${GLOBAL_AGENTS_SID.ANALYST}`,
    });

    if (result.isErr()) {
      setCreationFailed(true);
      setIsCreatingConversation(false);
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });
      return;
    }

    setConversation(result.value);
    setIsCreatingConversation(false);
  }, [createConversationWithMessage, sendNotification]);

  const resetConversation = useCallback(() => {
    hasStartedRef.current = false;
    setConversation(null);
    setCreationFailed(false);
  }, []);

  return {
    conversation,
    isCreatingConversation,
    creationFailed,
    startConversation,
    resetConversation,
  };
}
