import { z } from "zod";
import fs from "fs";

import { normalizeError } from "../../utils/errors.js";
import type { McpTool } from "../types/tools.js";
import { ReadFileTool } from "./readFile.js";

export class EditFileTool implements McpTool {
  // TODO: change prompt
  name = "edit_file";
  private diffApprovalCallback?: (
    originalContent: string,
    updatedContent: string,
    filePath: string
  ) => Promise<boolean>;

  description = `Replaces text within a file. By default, replaces a single occurrence, but can replace multiple occurrences when \`expected_replacements\` is specified. This tool requires providing significant context around the change to ensure precise targeting. Always use the ${ReadFileTool.name} tool to examine the file's current content before attempting a text replacement.

      The user has the ability to modify the \`new_string\` content. If modified, this will be stated in the response.

Expectation for required parameters:
1. \`file_path\` MUST be an absolute path; otherwise an error will be thrown.
2. \`old_string\` MUST be the exact literal text to replace (including all whitespace, indentation, newlines, and surrounding code etc.).
3. \`new_string\` MUST be the exact literal text to replace \`old_string\` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic.
4. NEVER escape \`old_string\` or \`new_string\`, that would break the exact literal text requirement.
**Important:** If ANY of the above are not satisfied, the tool will fail. CRITICAL for \`old_string\`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail.
**Multiple replacements:** Set \`expected_replacements\` to the number of occurrences you want to replace. The tool will replace ALL occurrences that match \`old_string\` exactly. Ensure the number of replacements matches your expectation.`;

  // also most schema names and descriptions gotten from Google's Gemini
  // add default values to descriptions?
  inputSchema = z.object({
    path: z
      .string()
      .describe(
        "The absolute path (such as '/home/user/project/file.txt') to the file to be edited. There is no support for relative routes. You have to give an absolute route."
      ),
    old_string: z
      .string()
      .describe(
        "The exact literal text to replace, preferably unescaped. For single replacements (default), include at least 3 lines of context BEFORE and AFTER the target text, " +
          "matching whitespace and indentation precisely. For multiple replacements, specify expected_replacements parameter. " +
          "If this string is not the exact literal text (i.e. you escaped it) or does not match exactly, the tool will fail."
      ),
    new_string: z
      .string()
      .describe(
        "The exact literal text to replace `old_string` with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic."
      ),
    expected_replacements: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "(OPTIONAL) Number of replacements expected. Defaults to 1 if not specified. Use when you want to replace multiple occurrences."
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
    old_string,
    new_string,
    expected_replacements = 1,
  }: z.infer<typeof this.inputSchema>) {
    try {
      // Validate file exists and is readable
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file content
      const originalContent = await fs.promises.readFile(filePath, "utf-8");

      // Count occurrences of old_string
      const regex = new RegExp(
        old_string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "g"
      );
      const matches = originalContent.match(regex);
      const occurrences = matches ? matches.length : 0;

      if (occurrences === 0) {
        throw new Error(`String not found in file: "${old_string}"`);
      }

      if (occurrences !== expected_replacements) {
        throw new Error(
          `Expected ${expected_replacements} replacements, but found ${occurrences} occurrences`
        );
      }

      const updatedContent = originalContent.replace(regex, new_string);

      // Request approval if callback is set
      if (this.diffApprovalCallback) {
        const approved = await this.diffApprovalCallback(
          originalContent,
          updatedContent,
          filePath
        );
        if (!approved) {
          return {
            content: [
              {
                type: "text" as const,
                text: `File edit was rejected by user.`,
              },
            ],
          };
        }
      }

      // Write the updated content back to the file
      await fs.promises.writeFile(filePath, updatedContent, "utf-8");

      const message = `Successfully replaced ${occurrences} occurrence${
        occurrences === 1 ? "" : "s"
      } in ${filePath}`;

      return {
        content: [
          {
            type: "text" as const,
            text: message,
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
