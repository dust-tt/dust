import { isJITActionsEnabled } from "@app/lib/api/assistant/jit_actions";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

export async function internalCreateToolOutputCsvFile(
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
    contentType: "text/csv";
  }
): Promise<FileResource> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();

  const fileResource = await FileResource.makeNew({
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

  await processAndStoreFile(auth, { file: fileResource, reqOrString: content });

  // If the tool returned no content, it makes no sense to upsert it to the data source
  if (content && isJITActionsEnabled(auth)) {
    const r = await processAndUpsertToDataSource(auth, {
      file: fileResource,
      optionalContent: content,
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

  return fileResource;
}
