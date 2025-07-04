import { z } from "zod";
import fs from "fs/promises";
import { normalizeError } from "../errors.js";
import { McpTool } from "../types/tool.js";

export class DeleteFileTool implements McpTool {
  name = "delete_file";
  description = "Delete a file or directory";

  inputSchema = z.object({
    path: z.string().describe("The file or directory path to delete"),
    recursive: z
      .boolean()
      .optional()
      .describe("Delete directories recursively (default: false)"),
  });

  async execute({
    path: targetPath,
    recursive = false,
  }: z.infer<typeof this.inputSchema>) {
    try {
      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive, force: true });
      } else {
        await fs.unlink(targetPath);
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully deleted ${targetPath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error deleting: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}