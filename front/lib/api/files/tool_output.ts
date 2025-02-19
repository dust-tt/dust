import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

export async function internalCreateToolOutputFile(
  auth: Authenticator,
  {
    title,
    conversationId,
    content,
    contentType,
  }: {
    title: string;
    conversationId: string;
    content: string;
    contentType: "text/csv" | "text/plain";
  }
): Promise<FileResource> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();

  const file = await FileResource.makeNew({
    workspaceId: workspace.id,
    userId: user?.id ?? null,
    contentType,
    fileName: title,
    fileSize: Buffer.byteLength(content),
    useCase: "tool_output",
    useCaseMetadata: {
      conversationId,
    },
  });

  await processAndStoreFile(auth, { file, reqOrString: content });

  // If the tool returned no content, it makes no sense to upsert it to the data source
  if (content) {
    const jitDataSource = await getOrCreateConversationDataSourceFromFile(
      auth,
      file
    );
    if (jitDataSource.isErr()) {
      logger.error(
        {
          code: jitDataSource.error.code,
          message: jitDataSource.error.message,
        },
        "Failed to get or create JIT data source"
      );
    } else {
      const r = await processAndUpsertToDataSource(auth, jitDataSource.value, {
        file,
      });
      if (r.isErr()) {
        logger.error(
          {
            code: r.error.code,
            message: r.error.message,
          },
          "Failed to process and upsert to data source"
        );
      }
    }
  }

  return file;
}
