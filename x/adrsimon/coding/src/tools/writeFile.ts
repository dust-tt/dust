import fs from "fs";
import path from "path";

import type { Tool, ToolContext } from "./index.js";

export function writeFileTool(context: ToolContext): Tool {
  return {
    name: "write_file",
    description:
      "Write content to a file. Creates the file and parent directories if they don't exist. " +
      "Overwrites the file if it already exists. Prefer edit_file for modifying existing files.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute or relative path to write to.",
        },
        content: {
          type: "string",
          description: "The content to write to the file.",
        },
      },
      required: ["file_path", "content"],
    },
    async execute(input) {
      const filePath = path.resolve(
        context.cwd,
        input.file_path as string
      );
      const content = input.content as string;

      // Create parent directories if needed.
      const dir = path.dirname(filePath);
      await fs.promises.mkdir(dir, { recursive: true });

      await fs.promises.writeFile(filePath, content, "utf-8");

      return `Successfully wrote ${content.length} characters to ${filePath}`;
    },
  };
}
