import type { CoreAPIDataSourceDocumentSection } from "@dust-tt/types";

import type { CSVRecord } from "@app/lib/api/assistant/actions/result_file_helpers";
import type { UpsertDocumentArgs } from "@app/lib/api/data_sources";
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

export async function internalCreateSearchableTextFile(
  auth: Authenticator,
  {
    title,
    conversationId,
    rows,
  }: {
    title: string;
    conversationId: string;
    rows: Array<CSVRecord>;
  }
): Promise<FileResource> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();

  let content: string = "";
  const sections: Array<CoreAPIDataSourceDocumentSection> = [];

  for (const row of rows) {
    const rowId = typeof row["Id"] === "string" ? row["Id"] : "";
    const rowName = typeof row["Name"] === "string" ? row["Name"] : "";
    const rowContent = JSON.stringify(row);
    const section: CoreAPIDataSourceDocumentSection = {
      prefix: `${title} - Row ${rowId} ${rowName}`,
      content: rowContent,
      sections: [],
    };
    sections.push(section);
    content += `${rowContent}\n`;
  }

  const file = await FileResource.makeNew({
    workspaceId: workspace.id,
    userId: user?.id ?? null,
    contentType: "text/vnd.dust.attachment.searchable.text",
    fileName: title,
    fileSize: Buffer.byteLength(content),
    useCase: "tool_output",
    useCaseMetadata: {
      conversationId,
    },
  });

  await processAndStoreFile(auth, { file, reqOrString: content });

  if (!content) {
    // If the tool returned no content, it makes no sense to upsert it to the data source
    // and we can just return the file.
    return file;
  }

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
    const upsertArgs: UpsertDocumentArgs = {
      auth,
      dataSource: jitDataSource.value,
      document_id: file.sId,
      title: file.fileName,
      mime_type: file.contentType,
      section: {
        prefix: file.fileName,
        content: "", // No content on main section, it's all in the children section: 1 per row.
        sections,
      },
    };
    const r = await processAndUpsertToDataSource(auth, jitDataSource.value, {
      file,
      upsertArgs,
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

  return file;
}
