import { z } from "zod";

import { normalizeError } from "../../utils/errors.js";
import { processFile } from "../../utils/fileHandling.js";
import type { McpTool } from "../types/tools.js";

export class ReadFileTool implements McpTool {
  name = "read_file";
  description =
    "Reads a given file from the local filesystem and returns its contents. Supports PDF files, text, and picture files (PNG, JPG, GIF, WEBP, SVG, and BMP). It can read certain line ranges from text files.";

  inputSchema = z.object({
    path: z
      .string()
      .describe(
        "The absolute path (such as '/user/folder/document.txt') to the file to be read. There is no support for relative routes. You have to give an absolute route."
      ),
    offset: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Optional: The 0-indexed line number to begin reading from in text files. The 'limit' must be set. This parameter should be used to paginate through huge files."
      ),
    limit: z
      .number()
      .optional()
      .describe(
        "Optional: The maximum number of lines to read from text files. To paginate across significant files, use 'offset'. The tool reads the whole file (up to a default limit, if possible) if it is not specified."
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
