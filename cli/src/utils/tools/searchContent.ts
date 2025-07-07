import { execSync } from "child_process";
import { z } from "zod";

import { normalizeError } from "../errors.js";
import type { McpTool } from "../types/tool.js";

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

  // API gotten from google's Gemini
  async execute({
    pattern,
    path = ".",
    file_pattern = "*",
  }: z.infer<typeof this.inputSchema>) {
    // include fall backs in case system doesn't have grep
    try {
      const cmd = `grep -r --include="${file_pattern}" "${pattern}" "${path}"`;
      const output = execSync(cmd, { encoding: "utf8" });

      return {
        content: [
          {
            type: "text" as const,
            text: output.trim() || `No matches found for: ${pattern}`,
          },
        ],
      };
    } catch (error: unknown) {
      // grep returns exit code 1 when no matches found
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 1
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No matches found for: ${pattern}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching content: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}
