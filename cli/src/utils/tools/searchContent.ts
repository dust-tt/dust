import { z } from "zod";
import { execSync } from "child_process";
import { normalizeError } from "../errors.js";
import { McpTool } from "../types/tool.js";

export class SearchContentTool implements McpTool {
  name = "search_content";
  description = "Search for content within files";

  inputSchema = z.object({
    query: z.string().describe("The text to search for"),
    directory: z
      .string()
      .optional()
      .describe("Directory to search in (default: current directory)"),
    file_pattern: z
      .string()
      .optional()
      .describe("File pattern to search within (default: all files)"),
    case_sensitive: z
      .boolean()
      .optional()
      .describe("Case sensitive search (default: false)"),
  });

  async execute({
    query,
    directory = ".",
    file_pattern = "*",
    case_sensitive = false,
  }: z.infer<typeof this.inputSchema>) {
    try {
      const flags = case_sensitive ? "" : "-i";
      const cmd = `grep -r ${flags} --include="${file_pattern}" "${query}" "${directory}"`;
      const output = execSync(cmd, { encoding: "utf8" });

      return {
        content: [
          {
            type: "text" as const,
            text: output.trim() || `No matches found for: ${query}`,
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
              text: `No matches found for: ${query}`,
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