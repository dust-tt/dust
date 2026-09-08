import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useCallback, useRef, useState } from "react";

// Hidden in the UI by the `analytics_panel` origin, and answered by a static reply rather than a
// model. The tool instruction only applies if that static reply ever stops matching.
const ANALYTICS_PANEL_BOOTSTRAP_MESSAGE = `<dust_system>
The user just opened the @analyst panel on the workspace Analytics page.
Do NOT call any tools. Greet briefly and offer 2-3 example questions they could ask.
</dust_system>`;

/**
 * @cc [owner:achilleburah,label:product] bootstraps-once-per-hook-instance
 * `startConversation` creates at most one conversation per hook instance. Calls after the first
 * are no-ops until `resetConversation` runs, and callers must gate the first call on the panel
 * being open, since the panel stays mounted while closed.
 */
export function useAnalyticsConversation({
  owner,
  user,
}: {
  owner: WorkspaceType;
  user: UserType | null;
}) {
  const sendNotification = useSendNotification();

  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [creationFailed, setCreationFailed] = useState(false);
  const hasStartedRef = useRef(false);

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

    const result = await createConversationWithMessage({
      messageData: {
        input: ANALYTICS_PANEL_BOOTSTRAP_MESSAGE,
        mentions: [{ configurationId: GLOBAL_AGENTS_SID.ANALYST }],
        contentFragments: { uploaded: [], contentNodes: [] },
        origin: "analytics_panel",
      },
      // Promoted to `unlisted` once the user writes, see `promoteAnalyticsPanelConversation`.
      visibility: "test",
      // Without a title, `ensureConversationTitle` would name the conversation after the
      // bootstrap message.
      title: `Ask ${GLOBAL_AGENTS_SID.ANALYST}`,
      metadata: { analyticsPanel: true },
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
