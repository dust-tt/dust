import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

/**
 * @cc [owner:achilleburah,label:security] frame-access
 * A Pod or folder Frame requires read access to its space. Any other Frame linked to a
 * conversation requires access to that conversation.
 */
export async function canAccessFrame(
  auth: Authenticator,
  frame: FileResource
): Promise<boolean> {
  if (
    frame.useCase === "project_context" ||
    frame.useCase === "folders_document"
  ) {
    const space = frame.useCaseMetadata?.spaceId
      ? await SpaceResource.fetchById(auth, frame.useCaseMetadata.spaceId)
      : null;
    return !!space && auth.can("read", space);
  }

  if (frame.useCaseMetadata?.conversationId) {
    const conversation = await ConversationResource.fetchById(
      auth,
      frame.useCaseMetadata.conversationId
    );
    return !!conversation;
  }

  return true;
}
