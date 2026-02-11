import path from "path";

import type { Tool, ToolContext } from "./index.js";
import { processFile } from "../utils/fileHandling.js";

export function readFileTool(context: ToolContext): Tool {
  return {
    name: "read_file",
    description:
      "Read a file from the filesystem. Returns the file content with line numbers. " +
      "For large files, use offset and limit to read specific sections.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute or relative path to the file to read.",
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (0-indexed). Default: 0.",
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to read. Default: 2000.",
        },
      },
      required: ["file_path"],
    },
    async execute(input) {
      const filePath = path.resolve(
        context.cwd,
        input.file_path as string
      );
      const offset = (input.offset as number) ?? 0;
      const limit = (input.limit as number) ?? 2000;

      const result = await processFile(filePath, offset, limit);

      if ("error" in result) {
        return result.error;
      }

      return result.data;
    },
  };
}
