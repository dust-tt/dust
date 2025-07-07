import { z } from "zod";

import { normalizeError } from "../errors.js";
import { processFile } from "../fileHandling.js";
import type { McpTool } from "../types/tool.js";

export class ReadFileTool implements McpTool {
  name = "read_file";
  description =
    "Reads and returns the content of a specified file from the local filesystem. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), and PDF files. For text files, it can read specific line ranges.";
  // TODO: description gotten from Google's Gemini

  // also most schema names and descriptions gotten from Google's Gemini
  // add default values to descriptions?
  // TODO: for some reason the relative file path works but not the full path
  inputSchema = z.object({
    path: z
      .string()
      .describe(
        "The absolute path to the file to read (e.g., '/home/user/project/file.txt'). Relative paths are not supported. You must provide an absolute path."
      ),
    offset: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Optional: For text files, the 0-based line number to start reading from. Requires 'limit' to be set. Use for paginating through large files"
      ),
    limit: z
      .number()
      .optional()
      .describe(
        "Optional: For text files, maximum number of lines to read. Use with 'offset' to paginate through large files. If omitted, reads the entire file (if feasible, up to a default limit)."
      ),
  });

  // add logic for formatting the lines and further logic for adding small message in case of truncation
  async execute({
    path: filePath,
    offset = 0,
    limit = 5000,
  }: z.infer<typeof this.inputSchema>) {
    try {
      // add logic for is readable type
      const content = await processFile(filePath, offset, limit);

      return {
        content: [
          {
            type: "text" as const,
            text: content.data,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}
