import fs from "fs";
import path from "path";

import type { Tool, ToolContext } from "./index.js";

export function editFileTool(context: ToolContext): Tool {
  return {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string match with new content. " +
      "The old_string must match exactly (including whitespace and indentation). " +
      "Use read_file first to see the current content.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute or relative path to the file to edit.",
        },
        old_string: {
          type: "string",
          description: "The exact string to find and replace. Must be unique in the file.",
        },
        new_string: {
          type: "string",
          description: "The replacement string.",
        },
        replace_all: {
          type: "boolean",
          description: "If true, replace all occurrences. Default: false.",
        },
      },
      required: ["file_path", "old_string", "new_string"],
    },
    async execute(input) {
      const filePath = path.resolve(
        context.cwd,
        input.file_path as string
      );
      const oldString = input.old_string as string;
      const newString = input.new_string as string;
      const replaceAll = (input.replace_all as boolean) ?? false;

      if (!fs.existsSync(filePath)) {
        return `Error: File does not exist: ${filePath}`;
      }

      const content = await fs.promises.readFile(filePath, "utf-8");

      if (!content.includes(oldString)) {
        return `Error: old_string not found in file. Make sure the string matches exactly (including whitespace).`;
      }

      if (!replaceAll) {
        // Check uniqueness.
        const firstIndex = content.indexOf(oldString);
        const secondIndex = content.indexOf(oldString, firstIndex + 1);
        if (secondIndex !== -1) {
          return `Error: old_string appears multiple times in the file. Provide more context to make it unique, or set replace_all to true.`;
        }
      }

      let newContent: string;
      if (replaceAll) {
        newContent = content.split(oldString).join(newString);
      } else {
        newContent = content.replace(oldString, newString);
      }

      await fs.promises.writeFile(filePath, newContent, "utf-8");

      const linesChanged = newString.split("\n").length - oldString.split("\n").length;
      const changeDesc = linesChanged === 0
        ? "modified"
        : linesChanged > 0
          ? `added ${linesChanged} lines`
          : `removed ${Math.abs(linesChanged)} lines`;

      return `Successfully edited ${filePath}: ${changeDesc}`;
    },
  };
}
