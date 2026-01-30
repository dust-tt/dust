import { generateProjectSummary } from "@app/lib/api/spaces/project_journal_summary";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { ProjectJournalEntryResource } from "@app/lib/resources/project_journal_entry_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";

/**
 * Activity to generate a project journal entry.
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

  // Fetch the space
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    logger.warn({ spaceId }, "Space not found");
    throw new Error(`Space with id ${spaceId} not found`);
  }

  // Generate the summary using LLM
  const summaryResult = await generateProjectSummary(auth, space);

  if (summaryResult.isErr()) {
    logger.error(
      { spaceId, error: summaryResult.error },
      "Failed to generate project summary"
    );
    throw summaryResult.error;
  }

  // Create and save the journal entry
  await ProjectJournalEntryResource.create(auth, {
    spaceId: space.id,
    journalEntry: summaryResult.value,
  });

  logger.info({ spaceId }, "Project journal entry created successfully");
}
