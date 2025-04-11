import type { CSVRecord } from "@app/lib/api/csv";
import { generateCSVSnippet, toCsv } from "@app/lib/api/csv";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { CoreAPIDataSourceDocumentSection } from "@app/types";

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
 * Generate a json file representing a table as a section.
 * This type of file is used to store the results of a tool call coming up from a csv in a way that can be searched.
 * Save it to the database and return it.
 */
export async function generateSectionFile(
  auth: Authenticator,
  {
    title,
    conversationId,
    results,
    sectionColumnsPrefix,
  }: {
    title: string;
    conversationId: string;
    results: Array<CSVRecord>;
    sectionColumnsPrefix: string[] | null;
  }
): Promise<FileResource> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();

  // We loop through the results to represent each row as a section.
  // The content of the file is the JSON representation of the section.
  const sections: Array<CoreAPIDataSourceDocumentSection> = [];
  for (const row of results) {
    const prefix = sectionColumnsPrefix
      ? sectionColumnsPrefix
          .map((c) => row[c] ?? "")
          .join(" ")
          .trim() || null
      : null;
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
  const content = JSON.stringify(section);

  const sectionFile = await FileResource.makeNew({
    workspaceId: workspace.id,
    userId: user?.id ?? null,
    contentType: "application/vnd.dust.section.json",
    fileName: title,
    fileSize: Buffer.byteLength(content),
    useCase: "tool_output",
    useCaseMetadata: {
      conversationId,
    },
  });

  await processAndStoreFile(auth, {
    file: sectionFile,
    content: {
      type: "string",
      value: content,
    },
  });

  return sectionFile;
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
