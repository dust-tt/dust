import { stringify } from "csv-stringify";

import { generateCSVSnippet } from "@app/lib/api/csv";
import { internalCreateToolOutputFile } from "@app/lib/api/files/tool_output";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";

export async function getToolResultOutputCsvFileAndSnippet(
  auth: Authenticator,
  {
    title,
    conversationId,
    results,
  }: {
    title: string;
    conversationId: string;
    results: Array<
      Record<string, string | number | boolean | null | undefined>
    >;
  }
): Promise<{
  csvFile: FileResource;
  snippet: string;
  textFile: FileResource | null;
}> {
  const toCsv = (
    records: Array<
      Record<string, string | number | boolean | null | undefined>
    >,
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

  // Preprocess results to replace rich text with a placeholder
  // TODO WRAP IN A IF
  const richTextRecords: Array<
    Record<string, string | number | boolean | null | undefined>
  > = [];

  const preprocessedResults = results.map((result) => {
    let putInRichTextRecord = false;
    const preprocessedResult = Object.fromEntries(
      Object.entries(result).map(([key, value]) => {
        if (typeof value === "string" && value.length > 1000) {
          putInRichTextRecord = true;
          return [key, "[Long text removed and uploaded to conversation]"];
        }
        return [key, value];
      })
    );
    if (putInRichTextRecord) {
      richTextRecords.push(result);
    }
    return preprocessedResult;
  });

  const csvOutput = await toCsv(preprocessedResults);

  const csvFile = await internalCreateToolOutputFile(auth, {
    title,
    conversationId,
    content: csvOutput,
    contentType: "text/csv",
  });

  let textFile: FileResource | null = null;
  if (richTextRecords.length > 0) {
    const richTextContent = richTextRecords
      .map((row) => {
        // Ensure we're creating valid JSON strings
        try {
          return JSON.stringify(row, null, 2);
        } catch (e) {
          console.error("Failed to stringify row:", e);
          return JSON.stringify({ error: "Failed to stringify row" });
        }
      })
      .join("\n");

    textFile = await internalCreateToolOutputFile(auth, {
      title: `${title} (Rich Text)`,
      conversationId,
      content: richTextContent,
      contentType: "text/plain",
    });
  }

  const snippet = generateCSVSnippet({
    content: csvOutput,
    totalRecords: results.length,
    hasReplacedRichText: richTextRecords.length > 0,
  });

  console.log("SOUPINOU");
  console.log(textFile);

  return { csvFile, textFile, snippet };
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
