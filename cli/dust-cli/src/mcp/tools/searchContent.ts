import { z } from "zod";

import { normalizeError } from "../../utils/errors.js";
import { MAX_LINE_LENGTH_TEXT_FILE } from "../../utils/fileHandling.js";
import { formatGrepRes, performGrep } from "../../utils/grep.js";
import type { McpTool } from "../types/tools.js";

export class SearchContentTool implements McpTool {
  name = "search_content";
  description = "Search for content within files";

  inputSchema = z.object({
    pattern: z.string().describe("The text to search for"),
    path: z
      .string()
      .optional()
      .describe("Directory to search in (default: current directory)"),
    file_pattern: z
      .string()
      .optional()
      .describe("File pattern to search within (default: all files)"),
  });

  async execute({
    pattern,
    path = ".",
    file_pattern = "*",
  }: z.infer<typeof this.inputSchema>) {
    const grepRes = await performGrep(pattern, path, file_pattern);
    if (grepRes.isErr()) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching for "${pattern}": ${
              normalizeError(grepRes.error).message
            }`,
          },
        ],
        isError: true,
      };
    }

    const formattedGrep = formatGrepRes(grepRes.value, path);

    if (formattedGrep.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No matches found for: ${pattern}`,
          },
        ],
      };
    }

    // Group results by file path and sort by line number
    const fileGroups = new Map<
      string,
      Array<{ lineNumber: number; content: string }>
    >();

    formattedGrep.forEach((result) => {
      if (!fileGroups.has(result.filePath)) {
        fileGroups.set(result.filePath, []);
      }
      const group = fileGroups.get(result.filePath);
      if (group) {
        group.push({
          lineNumber: result.lineNumber,
          content: result.content,
        });
      }
    });

    // Sort each file's results by line number
    fileGroups.forEach((results) => {
      results.sort((a, b) => a.lineNumber - b.lineNumber);
    });

    // Format output with relative paths ordered by line number
    let output = `Found ${formattedGrep.length} matches for "${pattern}" in the following files:\n\n`;

    let anyCut = false;
    Array.from(fileGroups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([filePath, results]) => {
        output += `${filePath}:\n`;
        results.forEach((result) => {
          let cut = false;
          if (result.content.length > MAX_LINE_LENGTH_TEXT_FILE) {
            cut = true;
            anyCut = true;
          }
          output += `  ${result.lineNumber}: ${result.content.substring(
            0,
            Math.min(MAX_LINE_LENGTH_TEXT_FILE, result.content.length)
          )}`;
          if (cut) {
            output += "... [cut]";
          }
          output += "\n";
        });
        output += "----------\n";
      });

    if (anyCut) {
      output =
        `[The content of these files have been partially cut: some lines exceeded maximum length of ${MAX_LINE_LENGTH_TEXT_FILE} characters.]\n` +
        output;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: output.trim(),
        },
      ],
    };
  }
}
