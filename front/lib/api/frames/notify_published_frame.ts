import { buildInteractiveContentFileNotification } from "@app/lib/api/actions/servers/interactive_content/helpers";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { isFrameContentType } from "@app/types/files";

/**
 * Opens the conversation Frame side panel after a sandbox publish, the same way legacy
 * `publish_interactive_content_file` and `conversation_side_panel.open_frame` do: emit an
 * `interactive_content_file` tool_notification on the parent sandbox action. Best-effort —
 * publish already succeeded; a missing action/frame or Redis failure must not fail the
 * HTTP response.
 */
export async function notifyPublishedFrameSidePanel(
  auth: Authenticator,
  {
    actionId,
    configurationId,
    conversationId,
    frameId,
    messageId,
  }: {
    actionId: string;
    configurationId: string;
    conversationId: string;
    frameId: string;
    messageId: string;
  }
): Promise<void> {
  try {
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

    const notification = buildInteractiveContentFileNotification(
      action.sId,
      frame,
      "Publishing Frame..."
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
  } catch (error) {
    logger.warn(
      {
        err: error,
        actionId,
        conversationId,
        messageId,
        frameId,
      },
      "Failed to emit Frame publish side-panel notification."
    );
  }
}
