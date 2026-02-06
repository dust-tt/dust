import { generateProjectSummary } from "@app/lib/api/projects/butler";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { ProjectJournalEntryResource } from "@app/lib/resources/project_journal_entry_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";

/**
 * Activity to generate a project journal entry using the Dust agent.
 *
 * This creates a "test" conversation (invisible to users), invokes the Dust agent
 * with project context, waits for completion, and saves the journal entry with
 * a reference to the conversation for debugging purposes.
 */
export async function generateProjectJournalEntryActivity(
  authType: AuthenticatorType,
  {
    spaceId,
  }: {
    spaceId: string;
  }
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;

  const workspace = auth.getNonNullableWorkspace();

  // Fetch the space
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    logger.warn({ spaceId }, "Space not found");
    throw new Error(`Space with id ${spaceId} not found`);
  }

  // Create a system conversation (invisible to users, no participants)
  const {
    conversation,
    agentMessages: [agentMessage],
  } = await generateProjectSummary(auth, {
    space,
  });

  const journalEntry = agentMessage.content;

  if (!journalEntry || journalEntry.trim().length === 0) {
    logger.error(
      {
        spaceId: space.sId,
        conversationId: conversation.sId,
        agentMessageId: agentMessage.sId,
      },
      "Agent message has no content"
    );
    throw new Error("Agent returned an empty response");
  }

  // Create and save the journal entry with conversation reference
  await ProjectJournalEntryResource.create(auth, {
    spaceId: space.id,
    journalEntry,
    sourceConversationId: conversation.id,
  });

  logger.info(
    {
      spaceId: space.sId,
      conversationId: conversation.sId,
      conversationUrl: `https://dust.tt/w/${workspace.sId}/assistant/${conversation.sId}`,
      journalLength: journalEntry.length,
    },
    "Project journal entry created successfully via Dust agent"
  );
}
