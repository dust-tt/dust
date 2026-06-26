import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { isSandboxRawDelimitedConversationFile } from "@app/lib/api/files/sandbox_raw";
import { generateSnippet } from "@app/lib/api/files/snippet";
import {
  isFileTypeUpsertableForUseCase,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { isPastedFile } from "@app/lib/files";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

// When we send the attachments at the conversation creation, we are missing the useCaseMetadata
// Therefore, we couldn't upsert them to the conversation datasource.
// We now update the useCaseMetadata and upsert them to the conversation datasource.
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

          await fileResource.setSnippet(snippetRes.value);
          return new Ok(undefined);
        }

        if (isMissingConversationId) {
          // Only upsert if the file is upsertable.
          if (
            !isSandboxRawDelimitedConversationFile(fileResource) &&
            isFileTypeUpsertableForUseCase(fileResource)
          ) {
            const jitDataSource =
              await getOrCreateConversationDataSourceFromFile(
                auth,
                fileResource
              );
            if (jitDataSource.isErr()) {
              logger.warn({
                fileModelId: fileResource.id,
                workspaceId: auth.getNonNullableWorkspace().sId,
                contentType: fileResource.contentType,
                useCase: fileResource.useCase,
                useCaseMetadata: fileResource.useCaseMetadata,
                message: "Failed to get or create JIT data source.",
                error: jitDataSource.error,
              });
              return new Ok(undefined);
            }

            const r = await processAndUpsertToDataSource(
              auth,
              jitDataSource.value,
              {
                file: fileResource,
              }
            );
            if (r.isErr()) {
              logger.error({
                fileModelId: fileResource.id,
                workspaceId: auth.getNonNullableWorkspace().sId,
                contentType: fileResource.contentType,
                useCase: fileResource.useCase,
                useCaseMetadata: fileResource.useCaseMetadata,
                message: "Failed to upsert the file.",
                error: r.error,
              });

              // Only surface user-actionable failures (e.g. a CSV the user can re-save in a
              // supported encoding); transient internal errors must not block the conversation.
              if (
                r.error.code === "invalid_csv_content" ||
                r.error.code === "invalid_file"
              ) {
                return new Err(
                  new Error(
                    `Failed to attach the file "${fileResource.fileName}": ${r.error.message}`
                  )
                );
              }
            }
          }
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
