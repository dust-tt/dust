import { createConversation } from "@app/lib/api/assistant/conversation";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectDigestModel } from "@app/lib/resources/storage/models/user_project_digest";
import type { ModelId } from "@app/types/shared/model_id";
import { faker } from "@faker-js/faker";

export class UserProjectDigestFactory {
  static async create({
    auth,
    space,
    digest,
    sourceConversationId,
  }: {
    auth: Authenticator;
    space: SpaceResource;
    digest?: string;
    sourceConversationId?: ModelId;
  }) {
    const workspace = auth.getNonNullableWorkspace();

    // If no sourceConversationId is provided, create a conversation.
    let conversationId = sourceConversationId;
    if (!conversationId) {
      const conversation = await createConversation(auth, {
        title: `Test Conversation ${faker.string.alphanumeric(8)}`,
        visibility: "unlisted",
        spaceId: space.id,
      });
      conversationId = conversation.id;
    }

    return UserProjectDigestModel.create({
      workspaceId: workspace.id,
      spaceId: space.id,
      sourceConversationId: conversationId,
      digest: digest ?? faker.lorem.paragraph(),
    });
  }

  static async createWithoutConversation({
    auth,
    space,
    digest,
  }: {
    auth: Authenticator;
    space: SpaceResource;
    digest?: string;
  }) {
    const workspace = auth.getNonNullableWorkspace();

    return UserProjectDigestModel.create({
      workspaceId: workspace.id,
      spaceId: space.id,
      userId: auth.getNonNullableUser().id,
      sourceConversationId: null,
      digest: digest ?? faker.lorem.paragraph(),
    });
  }
}
