import { z } from "zod";
import fs from "fs/promises";
import { normalizeError } from "../errors.js";
import { McpTool } from "../types/tool.js";

export class WriteFileTool implements McpTool {
  name = "write_file";
  description = "Write content to a file";

  inputSchema = z.object({
    path: z.string().describe("The file path to write to"),
    content: z.string().describe("The content to write"),
    encoding: z
      .enum(["utf8", "base64"])
      .optional()
      .describe("File encoding (default: utf8)"),
  });

  async execute({
    path: filePath,
    content,
    encoding = "utf8",
  }: z.infer<typeof this.inputSchema>) {
    try {
      await fs.writeFile(filePath, content, encoding);

      return {
        content: [
          { type: "text" as const, text: `Successfully wrote to ${filePath}` },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error writing file: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}
