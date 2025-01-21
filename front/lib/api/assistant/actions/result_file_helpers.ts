import { stringify } from "csv-stringify";

import { generateCSVSnippet } from "@app/lib/api/csv";
import { internalCreateToolOutputCsvFile } from "@app/lib/api/files/tool_output";
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
    results: Array<Record<string, string | number | boolean>>;
  }
): Promise<{
  file: FileResource;
  snippet: string;
}> {
  const toCsv = (
    records: Array<Record<string, string | number | boolean>>,
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

  const csvOutput = await toCsv(results);

  const file = await internalCreateToolOutputCsvFile(auth, {
    title,
    conversationId: conversationId,
    content: csvOutput,
    contentType: "text/csv",
  });

  return { file, snippet: generateCSVSnippet(csvOutput) };
}
