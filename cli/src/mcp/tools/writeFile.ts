import fs from "fs";
import path from "path";
import { z } from "zod";

import { normalizeError } from "../../utils/errors.js";
import type { McpTool } from "../types/tools.js";

export class WriteFileTool implements McpTool {
  name = "write_file";
  private diffApprovalCallback?: (
    originalContent: string,
    updatedContent: string,
    filePath: string
  ) => Promise<boolean>;

  description =
    "Creates a new file or overwrites an existing file with the provided content. " +
    "For modifying specific parts of an existing file, prefer edit_file instead. " +
    "Use this tool when you need to create a new file from scratch or completely replace a file's content.\n" +
    "Requirements:\n" +
    "1. `path` MUST use absolute path notation; relative paths will trigger an error.\n" +
    "2. `content` is the complete file content to write.\n" +
    "3. Parent directories are created automatically unless `create_directories` is set to false.";

  inputSchema = z.object({
    path: z
      .string()
      .describe(
        "Absolute path for the file to create or overwrite (e.g., '/home/user/project/newfile.ts'). Relative paths are not supported."
      ),
    content: z.string().describe("The complete file content to write"),
    create_directories: z
      .boolean()
      .optional()
      .describe(
        "Create parent directories if they don't exist (default: true)"
      ),
  });

  setDiffApprovalCallback(
    callback: (
      originalContent: string,
      updatedContent: string,
      filePath: string
    ) => Promise<boolean>
  ) {
    this.diffApprovalCallback = callback;
  }

  async execute({
    path: filePath,
    content,
    create_directories = true,
  }: z.infer<typeof this.inputSchema>) {
    const errorResponse = (message: string) => ({
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true as const,
    });

    const fileExists = fs.existsSync(filePath);
    let originalContent = "";

    if (fileExists) {
      try {
        originalContent = await fs.promises.readFile(filePath, "utf-8");
      } catch (error) {
        return errorResponse(
          `Failed to read existing file: ${normalizeError(error).message}`
        );
      }
    }

    // Request approval if callback is set
    if (this.diffApprovalCallback) {
      const approved = await this.diffApprovalCallback(
        originalContent,
        content,
        filePath
      );
      if (!approved) {
        return {
          content: [
            {
              type: "text" as const,
              text: "File write was rejected by user.",
            },
          ],
        };
      }
    }

    // Create parent directories if needed
    try {
      if (create_directories) {
        const dir = path.dirname(filePath);
        await fs.promises.mkdir(dir, { recursive: true });
      }

      await fs.promises.writeFile(filePath, content, "utf-8");
    } catch (error) {
      return errorResponse(
        `Failed to write file: ${normalizeError(error).message}`
      );
    }

    const message = fileExists
      ? `Successfully overwrote ${filePath}`
      : `Successfully created ${filePath}`;

    return {
      content: [
        {
          type: "text" as const,
          text: message,
        },
      ],
    };
  }
}
