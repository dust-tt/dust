import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { normalizeError } from "../errors.js";
import { McpTool } from "../types/tool.js";

export class ListFilesTool implements McpTool {
  name = "list_files";
  description = "List files and directories in a given path";

  inputSchema = z.object({
    path: z.string().describe("The directory path to list"),
    include_hidden: z
      .boolean()
      .optional()
      .describe("Include hidden files (default: false)"),
  });

  async execute({
    path: dirPath,
    include_hidden = false,
  }: z.infer<typeof this.inputSchema>) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      const items = entries
        .filter((entry) => include_hidden || !entry.name.startsWith("."))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
          path: path.join(dirPath, entry.name),
        }));

      return {
        content: [
          {
            type: "text" as const,
            text: `Files in ${dirPath}:\n${items
              .map(
                (item) =>
                  `${item.type === "directory" ? "📁" : "📄"} ${item.name}`
              )
              .join("\n")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing files: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}
