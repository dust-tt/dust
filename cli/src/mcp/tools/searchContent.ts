import { z } from "zod";

import { normalizeError } from "../../utils/errors.js";
import { MAX_LINE_LENGTH_TEXT_FILE } from "../../utils/fileHandling.js";
import { formatGrepRes, performGrep } from "../../utils/grep.js";
import type { McpTool } from "../types/tools.js";

export class SearchContentTool implements McpTool {
  name = "search_content";
  description = "Search for content within files";

  // is there a reason for the difference between using the word path and directory?
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
    try {
      const grepRes = await performGrep(pattern, path, file_pattern);
      const formattedGrep = formatGrepRes(grepRes, path);

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
        fileGroups.get(result.filePath)!.push({
          lineNumber: result.lineNumber,
          content: result.content,
        });
      });

      // Sort each file's results by line number
      fileGroups.forEach((results) => {
        results.sort((a, b) => a.lineNumber - b.lineNumber);
      });

      // Format output with relative paths ordered by line number
      let output = `Found ${formattedGrep.length} matches for "${pattern}" in the following directories:\n\n`;

      Array.from(fileGroups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([filePath, results]) => {
          output += `${filePath}:\n`;
          results.forEach((result) => {
            let truncated = false;
            if (result.content.length > MAX_LINE_LENGTH_TEXT_FILE) {
              truncated = true;
            }
            output += `  ${result.lineNumber}: ${result.content.substring(
              0,
              Math.min(MAX_LINE_LENGTH_TEXT_FILE, result.content.length)
            )}`;
            if (truncated) {
              output += "... [cut]";
            }
            output += "\n";
          });
          output += "----------\n";
        });

      output =
        `[The content of these files have been partially cut: some lines exceeded maximum length of ${MAX_LINE_LENGTH_TEXT_FILE} characters.]\n` +
        output;

      return {
        content: [
          {
            type: "text" as const,
            text: output.trim(),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching for "${pattern}": ${
              normalizeError(error).message
            }`,
          },
        ],
        isError: true,
      };
    }
  }
}
