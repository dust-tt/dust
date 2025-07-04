import { z } from "zod";
import fs from "fs/promises";
import { normalizeError } from "../errors.js";
import { McpTool } from "../types/tool.js";

export class ReadFileTool implements McpTool {
  name = "read_file";
  description = "Read the contents of a file";

  inputSchema = z.object({
    path: z.string().describe("The file path to read"),
    encoding: z
      .enum(["utf8", "base64"])
      .optional()
      .describe("File encoding (default: utf8)"),
  });

  async execute({
    path: filePath,
    encoding = "utf8",
  }: z.infer<typeof this.inputSchema>) {
    try {
      const content = await fs.readFile(filePath, encoding);

      return {
        content: [
          {
            type: "text" as const,
            text:
              encoding === "base64"
                ? content
                : `File: ${filePath}\n\n${content}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error reading file: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}
