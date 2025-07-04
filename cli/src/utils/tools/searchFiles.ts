import { z } from "zod";
import { execSync } from "child_process";
import { normalizeError } from "../errors.js";
import { McpTool } from "../types/tool.js";

export class SearchFilesTool implements McpTool {
  name = "search_files";
  description = "Search for files matching a pattern";

  inputSchema = z.object({
    pattern: z
      .string()
      .describe("The search pattern (supports glob patterns)"),
    directory: z
      .string()
      .optional()
      .describe("Directory to search in (default: current directory)"),
    case_sensitive: z
      .boolean()
      .optional()
      .describe("Case sensitive search (default: false)"),
  });

  async execute({
    pattern,
    directory = ".",
    case_sensitive = false,
  }: z.infer<typeof this.inputSchema>) {
    try {
      const flags = case_sensitive ? "" : "-i";
      const cmd = `find "${directory}" -name "${pattern}" ${flags} -type f`;
      const output = execSync(cmd, { encoding: "utf8" });
      const files = output
        .trim()
        .split("\n")
        .filter((f) => f);

      return {
        content: [
          {
            type: "text" as const,
            text:
              files.length > 0
                ? `Found ${files.length} files:\n${files.join("\n")}`
                : `No files found matching pattern: ${pattern}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching files: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}