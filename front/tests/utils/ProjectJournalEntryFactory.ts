import { faker } from "@faker-js/faker";

import { createConversation } from "@app/lib/api/assistant/conversation";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ProjectJournalEntryModel } from "@app/lib/resources/storage/models/project_journal_entry";
import type { ModelId } from "@app/types";

export class ProjectJournalEntryFactory {
  static async create({
    auth,
    space,
    journalEntry,
    sourceConversationId,
  }: {
    auth: Authenticator;
    space: SpaceResource;
    journalEntry?: string;
    sourceConversationId?: ModelId;
  }) {
    const workspace = auth.getNonNullableWorkspace();

    // If no sourceConversationId is provided, create a conversation
    let conversationId = sourceConversationId;
    if (!conversationId) {
      const conversation = await createConversation(auth, {
        title: `Test Conversation ${faker.string.alphanumeric(8)}`,
        visibility: "unlisted",
        spaceId: space.id,
      });
      conversationId = conversation.id;
    }

    return ProjectJournalEntryModel.create({
      workspaceId: workspace.id,
      spaceId: space.id,
      sourceConversationId: conversationId,
      journalEntry: journalEntry ?? faker.lorem.paragraph(),
    });
  }

  static async createWithoutConversation({
    auth,
    space,
    journalEntry,
  }: {
    auth: Authenticator;
    space: SpaceResource;
    journalEntry?: string;
  }) {
    const workspace = auth.getNonNullableWorkspace();

    return ProjectJournalEntryModel.create({
      workspaceId: workspace.id,
      spaceId: space.id,
      userId: auth.getNonNullableUser().id,
      sourceConversationId: null,
      journalEntry: journalEntry ?? faker.lorem.paragraph(),
    });
  }
}
