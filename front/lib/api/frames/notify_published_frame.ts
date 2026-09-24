import { buildInteractiveContentFileNotification } from "@app/lib/api/actions/servers/interactive_content/helpers";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { isFrameContentType } from "@app/types/files";

/**
 * Emits the same `interactive_content_file` tool_notification shape as
 * `processToolNotification` in mcp_execution.ts, so the conversation client can
 * open/refresh the Frame panel after a sandbox `/publish`.
 *
 * Best-effort: callers should `void … .catch(…)` so publish HTTP success is
 * unaffected. Missing frame/action is a quiet skip (expected races), not an error.
 *
 * `contentRevision` should be the new v2 `publicationId` so the panel remounts.
 * `autoOpen: false` so we refresh an open Frame panel without stealing the file explorer.
 */
export async function notifyPublishedFrameSidePanel(
  auth: Authenticator,
  {
    actionId,
    configurationId,
    conversationId,
    frameId,
    messageId,
    contentRevision,
  }: {
    actionId: string;
    configurationId: string;
    conversationId: string;
    frameId: string;
    messageId: string;
    contentRevision?: string;
  }
): Promise<void> {
  const [frame, action] = await Promise.all([
    FileResource.fetchById(auth, frameId),
    AgentMCPActionResource.fetchById(auth, actionId),
  ]);

  if (!frame || !isFrameContentType(frame.contentType)) {
    logger.warn(
      { frameId, conversationId, messageId },
      "Skipping Frame publish side-panel notification: Frame not found."
    );
    return;
  }

  if (!action) {
    logger.warn(
      { actionId, conversationId, messageId, frameId },
      "Skipping Frame publish side-panel notification: parent action not found."
    );
    return;
  }

  // Same event shape as processToolNotification (agent_loop branch).
  const notification = buildInteractiveContentFileNotification(
    action.id,
    frame,
    "Publishing Frame...",
    { contentRevision, autoOpen: false }
  );

  await publishConversationRelatedEvent({
    conversationId,
    step: action.stepContent.step,
    event: {
      type: "tool_notification",
      created: Date.now(),
      configurationId,
      conversationId,
      messageId,
      action: {
        ...action.toJSON(),
        output: null,
        generatedFiles: [],
      },
      notification: notification.params,
    },
  });
}
