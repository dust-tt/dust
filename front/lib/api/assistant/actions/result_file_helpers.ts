import { stringify } from "csv-stringify";

import { generateCSVSnippet } from "@app/lib/api/csv";
import {
  internalCreateSearchableTextFile,
  internalCreateToolOutputFile,
} from "@app/lib/api/files/tool_output";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";

export type CSVRecord = Record<
  string,
  string | number | boolean | null | undefined
>;
const RICH_TEXT_MIN_LENGTH = 500;

const toCsv = (
  records: Array<CSVRecord>,
  options: { header: boolean } = { header: true }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    stringify(records, options, (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });
};

export async function getToolResultOutputFilesAndSnippet(
  auth: Authenticator,
  {
    title,
    conversationId,
    results,
    generateSearchableFile = false,
  }: {
    title: string;
    conversationId: string;
    results: Array<CSVRecord>;
    generateSearchableFile?: boolean;
  }
): Promise<{
  csvFile: FileResource;
  csvSnippet: string;
  searchableFile: FileResource | null;
}> {
  const shouldGenerateSearchableFile =
    generateSearchableFile &&
    results.some((result) => {
      for (const value of Object.values(result)) {
        if (typeof value === "string" && value.length > RICH_TEXT_MIN_LENGTH) {
          return true;
        }
      }
      return false;
    });

  // Generate the CSV file.
  const csvOutput = await toCsv(results);
  const csvFile = await internalCreateToolOutputFile(auth, {
    title,
    conversationId,
    content: csvOutput,
    contentType: "text/csv",
  });
  const csvSnippet = generateCSVSnippet({
    content: csvOutput,
    totalRecords: results.length,
    hasSearchableFile: shouldGenerateSearchableFile,
  });

  // Generate a searchable text file (JSONL).
  let searchableFile: FileResource | null = null;
  if (shouldGenerateSearchableFile) {
    searchableFile = await internalCreateSearchableTextFile(auth, {
      title,
      conversationId,
      rows: results,
    });
  }

  return { csvFile, searchableFile, csvSnippet };
}

export async function getToolResultOutputPlainTextFileAndSnippet(
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
): Promise<{ file: FileResource; snippet: string | null }> {
  const file = await internalCreateToolOutputFile(auth, {
    title,
    conversationId,
    content,
    contentType: "text/plain",
  });

  return { file, snippet: file.snippet };
}
