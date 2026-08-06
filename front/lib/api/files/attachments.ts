import { generateSnippet } from "@app/lib/api/files/snippet";
import type { Authenticator } from "@app/lib/auth";
import { isPastedFile } from "@app/lib/files";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

// When we send the attachments at the conversation creation, we are missing the useCaseMetadata.
// We now update the useCaseMetadata (and generate pasted-file snippets when needed).
export async function maybeUpsertFileAttachment(
  auth: Authenticator,
  {
    contentFragments,
    conversation,
  }: {
    contentFragments: (
      | {
          fileId: string;
        }
      | object
    )[];
    conversation: ConversationWithoutContentType;
  }
): Promise<Result<undefined, Error>> {
  const filesIds = removeNulls(
    contentFragments.map((cf) => {
      if ("fileId" in cf) {
        return cf.fileId;
      }
    })
  );

  if (filesIds.length > 0) {
    const fileResources = await FileResource.fetchByIds(auth, filesIds);
    const results = await concurrentExecutor(
      fileResources,
      async (fileResource): Promise<Result<undefined, Error>> => {
        const isConversationFile = fileResource.useCase === "conversation";
        const isMissingConversationId =
          isConversationFile && !fileResource.useCaseMetadata?.conversationId;

        if (isMissingConversationId) {
          await fileResource.setUseCaseMetadata(auth, {
            ...(fileResource.useCaseMetadata ?? {}),
            conversationId: conversation.sId,
          });
        }

        if (
          isConversationFile &&
          isPastedFile(fileResource.contentType) &&
          fileResource.snippet === null
        ) {
          const snippetRes = await generateSnippet(auth, {
            file: fileResource,
          });
          if (snippetRes.isErr()) {
            logger.error(
              {
                fileModelId: fileResource.id,
                workspaceId: auth.getNonNullableWorkspace().sId,
                error: snippetRes.error,
              },
              "Failed to generate pasted file snippet."
            );
            return new Ok(undefined);
          }

          // Note from seb: this tell the system "you can do JIT actions on this file". (i know, it's not great)
          // So we ignore later when doing canDoJIT checks.
          await fileResource.setSnippet(snippetRes.value);
          return new Ok(undefined);
        }

        return new Ok(undefined);
      },
      { concurrency: 4 }
    );

    const failures = removeNulls(
      results.map((r) => (r.isErr() ? r.error : null))
    );
    if (failures.length > 0) {
      return new Err(new Error(failures.map((e) => e.message).join("; ")));
    }
  }
  return new Ok(undefined);
}
