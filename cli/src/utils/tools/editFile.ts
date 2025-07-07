import fs from "fs/promises";
import { z } from "zod";

import { normalizeError } from "../errors.js";
import type { McpTool } from "../types/tool.js";

export class EditFileTool implements McpTool {
  name = "edit_file";
  description =
    "Edit a file by replacing specific text content with new content";

  // TODO: implement multi-edit

  inputSchema = z.object({
    path: z.string().describe("The file path to edit"),
    old_string: z.string().describe("The exact text to replace"),
    new_string: z.string().describe("The text to replace it with"),
    expected_replacements: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Number of replacements expected (default: 1)"),
  });

  // Logic inspired from Google's Gemini
  async execute({
    path: filePath,
    old_string,
    new_string,
    expected_replacements = 1,
  }: z.infer<typeof this.inputSchema>) {
    try {
      // Check if file exists
      let currentContent: string;
      try {
        currentContent = await fs.readFile(filePath, "utf8");
      } catch (error) {
        const err = normalizeError(error);
        if (err.message.includes("ENOENT")) {
          // File doesn't exist - check if old_string is empty (create new file)
          if (old_string === "") {
            await fs.writeFile(filePath, new_string, "utf8");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Created new file: ${filePath}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: File not found. Use empty old_string to create a new file.`,
                },
              ],
              isError: true,
            };
          }
        }
        throw error;
      }

      // If old_string is empty but file exists, return error
      if (old_string === "") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: File already exists. Cannot create with empty old_string.`,
            },
          ],
          isError: true,
        };
      }

      // Count occurrences of old_string
      const occurrences = (
        currentContent.match(
          new RegExp(old_string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
        ) || []
      ).length;

      if (occurrences === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Could not find the string to replace. Found 0 occurrences of the specified text.`,
            },
          ],
          isError: true,
        };
      }

      if (occurrences !== expected_replacements) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Expected ${expected_replacements} occurrences but found ${occurrences}.`,
            },
          ],
          isError: true,
        };
      }

      // Perform the replacement
      const newContent = currentContent.replaceAll(old_string, new_string);

      // Write the updated content back to the file
      await fs.writeFile(filePath, newContent, "utf8");

      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully edited ${filePath} (${occurrences} replacements)`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error editing file: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}
