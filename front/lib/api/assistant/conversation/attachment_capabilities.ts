import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { AttachmentCapabilityContext } from "@app/types/api/assistant/conversation/attachments";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

/**
 * Single place resolving the conversation-wide inputs to attachment capability flags. Call it once
 * per rendering pass or tool execution and pass the result down: every consumer of `isIncludable`,
 * `isQueryable` and `isSearchable` then reads flags that already account for the file explorer and
 * for Computer availability.
 */
export function getAttachmentCapabilityContext(
  conversation:
    | Pick<ConversationWithoutContentType, "metadata">
    | Pick<ConversationResource, "metadata">
): AttachmentCapabilityContext {
  return {
    isNewFileExplorer: conversation.metadata?.useFileSystem === true,
    hasSandboxTools: true,
  };
}
