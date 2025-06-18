import type { CSVRecord } from "@app/lib/api/csv";
import { generateCSVSnippet, toCsv } from "@app/lib/api/csv";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

export { generateCSVSnippet } from "@app/lib/api/csv";

/**
 * Generate a plain text file.
 * Save the file to the database and return it.
 */
export async function generatePlainTextFile(
  auth: Authenticator,
  {
    title,
    conversationId,
    content,
  }: {
    title: string;
    conversationId: string;
    content: string;
  }
): Promise<FileResource> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();

  const plainTextFile = await FileResource.makeNew({
    workspaceId: workspace.id,
    userId: user?.id ?? null,
    contentType: "text/plain",
    fileName: title,
    fileSize: Buffer.byteLength(content),
    useCase: "tool_output",
    useCaseMetadata: {
      conversationId,
    },
  });

  await processAndStoreFile(auth, {
    file: plainTextFile,
    content: {
      type: "string",
      value: content,
    },
  });

  return plainTextFile;
}

/**
 * Generate CSV output from results.
 * Returns the CSV content, content type, and filename.
 */
export async function generateCSVOutput(
  title: string,
  results: Array<CSVRecord>
): Promise<{
  csvOutput: string;
  contentType: "text/csv" | "text/plain";
  fileName: string;
}> {
  if (results.length > 0) {
    return {
      csvOutput: await toCsv(results),
      contentType: "text/csv",
      fileName: `${title}.csv`,
    };
  } else {
    return {
      csvOutput: "The query produced no results.",
      contentType: "text/plain",
      fileName: `${title}.txt`,
    };
  }
}

/**
 * Generate a CSV file and a snippet of the file.
 * Save the file to the database and return the file and the snippet.
 */
export async function generateCSVFileAndSnippet(
  auth: Authenticator,
  {
    title,
    conversationId,
    results,
  }: {
    title: string;
    conversationId: string;
    results: Array<CSVRecord>;
  }
): Promise<{
  csvFile: FileResource;
  csvSnippet: string;
}> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();

  const { csvOutput, contentType, fileName } = await generateCSVOutput(
    title,
    results
  );

  const csvFile = await FileResource.makeNew({
    workspaceId: workspace.id,
    userId: user?.id ?? null,
    contentType,
    fileName,
    fileSize: Buffer.byteLength(csvOutput),
    useCase: "tool_output",
    useCaseMetadata: {
      conversationId,
    },
  });
  const csvSnippet = generateCSVSnippet({
    content: csvOutput,
    totalRecords: results.length,
  });

  await processAndStoreFile(auth, {
    file: csvFile,
    content: {
      type: "string",
      value: csvOutput,
    },
  });

  return { csvFile, csvSnippet };
}

/**
 * Upload a file to a conversation data source.
 * If a section is provided, we will pass it to the process file function as upsertArgs.
 */
export async function uploadFileToConversationDataSource({
  auth,
  file,
}: {
  auth: Authenticator;
  file: FileResource;
}) {
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

/**
 * Generate JSON snippet from data.
 */
export function generateJSONSnippet(data: unknown): string {
  let jsonSnippet = "";
  if (Array.isArray(data)) {
    const displayItems = data.slice(0, 5);
    const remainingCount = data.length > 5 ? data.length - 5 : 0;
    jsonSnippet = JSON.stringify(displayItems, null, 2);
    if (remainingCount > 0) {
      jsonSnippet += `\n\n... ${remainingCount} more items`;
    }
  } else {
    jsonSnippet = JSON.stringify(data, null, 2);
    if (jsonSnippet.length > 1000) {
      jsonSnippet = jsonSnippet.substring(0, 1000) + "... (truncated)";
    }
  }

  return jsonSnippet;
}

export function getJSONFileAttachment({
  jsonFileId,
  jsonFileSnippet,
  title,
}: {
  jsonFileId: string | null;
  jsonFileSnippet: string | null;
  title: string;
}): string | null {
  if (!jsonFileId || !jsonFileSnippet) {
    return null;
  }

  return `<file id="${jsonFileId}" type="application/json" title="${title}">\n${jsonFileSnippet}\n</file>`;
}
