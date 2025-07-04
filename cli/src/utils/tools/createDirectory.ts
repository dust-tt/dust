import { z } from "zod";
import fs from "fs/promises";
import { normalizeError } from "../errors.js";
import { McpTool } from "../types/tool.js";

export class CreateDirectoryTool implements McpTool {
  name = "create_directory";
  description = "Create a new directory";

  inputSchema = z.object({
    path: z.string().describe("The directory path to create"),
    recursive: z
      .boolean()
      .optional()
      .describe("Create parent directories if they don't exist (default: true)"),
  });

  async execute({
    path: dirPath,
    recursive = true,
  }: z.infer<typeof this.inputSchema>) {
    try {
      await fs.mkdir(dirPath, { recursive });
      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully created directory ${dirPath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating directory: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}