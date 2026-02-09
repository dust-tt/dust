import fs from "fs";
import { z } from "zod";

import { normalizeError } from "../../utils/errors.js";
import type { McpTool } from "../types/tools.js";
import { ReadFileTool } from "./readFile.js";

export class EditFileTool implements McpTool {
  name = "edit_file";
  private diffApprovalCallback?: (
    originalContent: string,
    updatedContent: string,
    filePath: string
  ) => Promise<boolean>;

  description =
    "Modifies content within a file by substituting specified text segments. " +
    "Performs single substitution by default, or multiple substitutions when `expected_replacements` is defined. " +
    "This function demands comprehensive contextual information surrounding the target modification to ensure accurate targeting. " +
    `Always utilize the ${ReadFileTool.name} tool to review the file's existing content prior to executing any text substitution. ` +
    "Requirements for mandatory parameters:\n" +
    "1. `path` NEEDS TO use absolute path notation; relative paths will trigger an error.\n" +
    "2. `old_string` NEEDS TO contain the precise literal content for substitution (preserving all spacing, formatting, line breaks, and etc).\n" +
    "3. `new_string` NEEDS TO contain the precise literal content that will substitute `old_string` (maintaining all spacing, formatting, line breaks, and etc). " +
    "Verify the output maintains proper syntax and follows best practices.\n" +
    "4. DO NOT apply escaping to `old_string` or `new_string`, as this violates the literal text requirement.\n\n" +
    "**Critical:** Failure to meet these requirements will cause tool failure.\n" +
    "ESSENTIAL for `old_string`: Must provide unique identification for the specific instance requiring modification. " +
    "Include minimum 3 lines of surrounding context BEFORE and AFTER the target content, preserving exact spacing and formatting. Multiple matches or inexact matches will cause failure." +
    "**Batch replacements:** Define `expected_replacements` with the number of instances to modify. The tool will modify ALL instances matching `old_string` precisely. " +
    "Verify the replacement count aligns with your intentions.";

  inputSchema = z.object({
    path: z
      .string()
      .describe(
        "The complete absolute file path (example: '/home/user/project/file.txt') for the target file. Relative paths are not supported. Must provide full absolute path."
      ),
    old_string: z
      .string()
      .describe(
        "The exact text to find and change - write it exactly as it appears in the file. " +
          "For single changes: Include 3+ lines before and after your target text with exact spacing. " +
          "For multiple changes: Set expected_replacements too. " +
          "If the text doesn't match exactly, the tool won't work."
      ),
    new_string: z
      .string()
      .describe(
        "The exact text to replace `old_string` with - write it exactly how you want it to appear. Make sure the result makes sense in the context, whether it be a letter, mathematical formula or code."
      ),
    expected_replacements: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "(OPTIONAL) How many times to make the change. Leave empty for just one change (default). Use when you want to change multiple identical pieces of text."
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
        throw new Error(
          `File not found: ${filePath} — verify the path is correct. Use list_directory to browse the directory structure.`
        );
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
        const preview =
          old_string.length > 80
            ? old_string.substring(0, 80) + "..."
            : old_string;
        throw new Error(
          `String not found in file. First 80 chars of search: \`${preview}\` — check for whitespace/indentation differences. Use read_file to verify the current content.`
        );
      }

      if (occurrences !== expected_replacements) {
        // Find line numbers of all occurrences
        const lineNumbers: number[] = [];
        const escapedStr = old_string.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );
        const singleRegex = new RegExp(escapedStr, "g");
        let match;
        while ((match = singleRegex.exec(originalContent)) !== null) {
          const lineNum =
            originalContent.substring(0, match.index).split("\n").length;
          lineNumbers.push(lineNum);
        }
        throw new Error(
          `Expected ${expected_replacements} replacement(s), but found ${occurrences} occurrence(s) (at lines ${lineNumbers.join(", ")}). Provide more surrounding context in old_string to uniquely identify the target.`
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
