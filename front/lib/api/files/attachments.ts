import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { ConversationType, Result } from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";

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
    conversation: ConversationType;
  }
): Promise<Result<undefined, DustError>> {
  const filesIds = removeNulls(
    contentFragments.map((cf) => {
      if ("fileId" in cf) {
        return cf.fileId;
      }
    })
  );

  if (filesIds.length > 0) {
    const fileResources = await FileResource.fetchByIds(auth, filesIds);
    await Promise.all([
      ...fileResources.map(async (fileResource) => {
        if (
          fileResource.useCase === "conversation" &&
          !fileResource.useCaseMetadata
        ) {
          await fileResource.setUseCaseMetadata({
            conversationId: conversation.sId,
          });
          const jitDataSource = await getOrCreateConversationDataSourceFromFile(
            auth,
            fileResource
          );
          if (jitDataSource.isErr()) {
            return new Err({
              name: "dust_error",
              code: "internal_server_error",
              message: "Failed to get or create JIT data source.",
              error: jitDataSource.error,
            });
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
              workspaceId: conversation.owner.sId,
              contentType: fileResource.contentType,
              useCase: fileResource.useCase,
              useCaseMetadata: fileResource.useCaseMetadata,
              message: "Failed to upsert the file.",
              error: r.error,
            });
            return new Err({
              name: "dust_error",
              code: "internal_server_error",
              message: "Failed to upsert the file.",
              error: r.error,
            });
          }
        }
      }),
    ]);
  }
  return new Ok(undefined);
}
