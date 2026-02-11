import type { Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function moveConversationToProject(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  project: SpaceResource,
  transaction?: Transaction
): Promise<
  Result<
    void,
    DustError<"internal_error" | "unauthorized" | "conversation_not_found">
  >
> {
  if (isProjectConversation(conversation)) {
    return new Err(
      new DustError("internal_error", "Conversation is already in a project")
    );
  }

  if (!project.isMember(auth)) {
    return new Err(
      new DustError("unauthorized", "User is not a member of the project")
    );
  }

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversation.sId
  );
  if (!conversationResource) {
    return new Err(
      new DustError("conversation_not_found", "Conversation not found")
    );
  }

  await withTransaction(async (t) => {
    await conversationResource.updateSpaceId(project, t);
    // See front/lib/api/assistant/conversation/mentions.ts updateConversationRequirements for more details
    await conversationResource.updateRequirements([project.id], t);
  }, transaction);

  return new Ok(undefined);
}
