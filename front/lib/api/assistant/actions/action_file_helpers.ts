import type {
  ConnectorProvider,
  CoreAPIDataSourceDocumentSection,
} from "@dust-tt/types";

import type { CSVRecord } from "@app/lib/api/csv";
import { generateCSVSnippet, toCsv } from "@app/lib/api/csv";
import type { UpsertDocumentArgs } from "@app/lib/api/data_sources";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

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
    reqOrString: content,
  });

  return plainTextFile;
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

  const csvOutput = await toCsv(results);
  const csvFile = await FileResource.makeNew({
    workspaceId: workspace.id,
    userId: user?.id ?? null,
    contentType: "text/csv",
    fileName: title,
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

  await processAndStoreFile(auth, { file: csvFile, reqOrString: csvOutput });

  return { csvFile, csvSnippet };
}

/**
 * Generate a searchable text file. This type of file is used to store the results of a
 * tool call coming up from a csv in a way that can be searched.
 * Save it to the database and return it.
 */
export async function generateSearchableFile(
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
): Promise<FileResource> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();

  const content = JSON.stringify(results);
  const searchableFile = await FileResource.makeNew({
    workspaceId: workspace.id,
    userId: user?.id ?? null,
    contentType: "application/vnd.dust.section-structured",
    fileName: title,
    fileSize: Buffer.byteLength(content),
    useCase: "tool_output",
    useCaseMetadata: {
      conversationId,
    },
  });

  await processAndStoreFile(auth, {
    file: searchableFile,
    reqOrString: content,
  });

  return searchableFile;
}

/**
 * Generate a CoreAPIDataSourceDocumentSection from a list of CSV records.
 * This section can be used to upload a searchable file to a conversation data source.
 */
export async function generateSearchableSection({
  title,
  results,
  connectorProvider,
}: {
  title: string;
  results: Array<CSVRecord>;
  connectorProvider: ConnectorProvider | null;
}): Promise<CoreAPIDataSourceDocumentSection> {
  const sections: Array<CoreAPIDataSourceDocumentSection> = [];

  // We loop through the results to generate the section and the content of the file.
  for (const row of results) {
    const prefix = getSearchableSectionRowPrefix(connectorProvider, row);
    const rowContent = JSON.stringify(row);
    const section: CoreAPIDataSourceDocumentSection = {
      prefix,
      content: rowContent,
      sections: [],
    };
    sections.push(section);
  }
  const section = {
    prefix: title,
    content: null,
    sections,
  };

  return section;
}

/**
 * Get the prefix for a row in a searchable section.
 * This prefix is used to identify the row in the searchable file.
 * We currently only support Salesforce since it's the only connector for which we can
 * generate a prefix.
 */
function getSearchableSectionRowPrefix(
  provider: ConnectorProvider | null,
  row: CSVRecord
): string | null {
  if (provider === "salesforce") {
    const rowId = typeof row["Id"] === "string" ? row["Id"] : "";
    const rowName = typeof row["Name"] === "string" ? row["Name"] : "";
    return `${rowId} ${rowName}`.trim();
  }
  return null;
}

/**
 * Upload a file to a conversation data source.
 * If a section is provided, we will pass it to the process file function as upsertArgs.
 */
export async function uploadFileToConversationDataSource({
  auth,
  file,
  section,
}: {
  auth: Authenticator;
  file: FileResource;
  section?: CoreAPIDataSourceDocumentSection;
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
    const upsertArgs: UpsertDocumentArgs | undefined =
      section !== undefined
        ? {
            auth,
            dataSource: jitDataSource.value,
            document_id: file.sId,
            title: file.fileName,
            mime_type: file.contentType,
            section,
          }
        : undefined;

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
}
