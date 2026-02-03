import { createConversation } from "@app/lib/api/assistant/conversation";
import { postUserMessageAndWaitForCompletion } from "@app/lib/api/assistant/streaming/blocking";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { ProjectJournalEntryResource } from "@app/lib/resources/project_journal_entry_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { GLOBAL_AGENTS_SID } from "@app/types";

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
  const conversation = await createConversation(auth, {
    title: `[System] Journal Generation - ${space.name}`,
    visibility: "test",
    spaceId: space.id,
    metadata: {
      systemConversation: true,
      purpose: "journal_generation",
      triggeredBy: auth.user()?.sId ?? "system",
      spaceId: space.sId,
    },
  });

  logger.info(
    {
      conversationId: conversation.sId,
      spaceId: space.sId,
      spaceName: space.name,
    },
    "Created system conversation for journal generation"
  );

  // Post message to invoke the Dust agent
  const prompt = `Generate a comprehensive markdown journal entry for the project "${space.name}" covering activity from the last 7 days.

Search through the project's conversations and data to create a well-structured summary that includes:

1. **Executive Summary**: 2-3 sentences highlighting the most important developments
2. **Key Conversations & Decisions**: Major discussions and outcomes
3. **Document Updates**: Files created or modified
4. **Member Contributions**: Who worked on what
5. **Blockers & Risks**: Any issues or concerns
6. **Next Steps**: Upcoming priorities

Focus on actionable insights and concrete progress made. Your response should be the complete markdown journal entry.`;

  const messageResult = await postUserMessageAndWaitForCompletion(auth, {
    content: prompt,
    context: {
      username: "system",
      fullName: "System",
      email: null,
      profilePictureUrl: null,
      timezone: "UTC",
      origin: "project_butler",
    },
    conversation,
    mentions: [
      {
        configurationId: GLOBAL_AGENTS_SID.DUST,
      },
    ],
    skipToolsValidation: false,
  });

  if (messageResult.isErr()) {
    const errorMessage =
      messageResult.error.api_error?.message ||
      JSON.stringify(messageResult.error);
    logger.error(
      {
        spaceId: space.sId,
        conversationId: conversation.sId,
        error: messageResult.error,
      },
      "Failed to post message or wait for agent completion"
    );
    throw new Error(`Failed to generate journal via agent: ${errorMessage}`);
  }

  const { agentMessages } = messageResult.value;

  if (agentMessages.length === 0) {
    logger.error(
      {
        spaceId: space.sId,
        conversationId: conversation.sId,
      },
      "No agent messages received"
    );
    throw new Error("Agent did not respond with a message");
  }

  // Extract the journal content from the agent message
  const agentMessage = agentMessages[0];
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
