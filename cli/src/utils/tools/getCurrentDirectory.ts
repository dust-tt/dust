import { z } from "zod";
import { normalizeError } from "../errors.js";
import { McpTool } from "../types/tool.js";

export class GetCurrentDirectoryTool implements McpTool {
  name = "get_current_directory";
  description = "Get the current working directory";

  inputSchema = z.object({});

  async execute(_args: z.infer<typeof this.inputSchema>) {
    try {
      const cwd = process.cwd();
      return {
        content: [
          {
            type: "text" as const,
            text: `Current directory: ${cwd}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting current directory: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}