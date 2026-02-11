import path from "path";

import type { Tool, ToolContext } from "./index.js";
import { performGrep, formatGrepRes } from "../utils/grep.js";

const MAX_RESULTS = 200;
const MAX_LINE_LENGTH = 2000;

export function grepTool(context: ToolContext): Tool {
  return {
    name: "grep",
    description:
      "Search file contents using regex patterns. Returns matching lines with file paths and line numbers. " +
      "Uses extended regular expression syntax.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The regex pattern to search for.",
        },
        directory: {
          type: "string",
          description: "Directory to search in. Default: project root.",
        },
        file_pattern: {
          type: "string",
          description: 'Optional glob to filter files. E.g. "*.ts", "*.py".',
        },
      },
      required: ["pattern"],
    },
    async execute(input) {
      const pattern = input.pattern as string;
      const directory = (input.directory as string)
        ? path.resolve(context.cwd, input.directory as string)
        : context.cwd;
      const filePattern = input.file_pattern as string | undefined;

      const grepResult = await performGrep(pattern, directory, filePattern);

      if (grepResult.isErr()) {
        return `Error: ${grepResult.error.message}`;
      }

      const rawOutput = grepResult.value;

      if (!rawOutput.trim()) {
        return "No matches found.";
      }

      const results = formatGrepRes(rawOutput, directory);

      if (results.length === 0) {
        return "No matches found.";
      }

      const limited = results.slice(0, MAX_RESULTS);
      const lines = limited.map((r) => {
        const content =
          r.content.length > MAX_LINE_LENGTH
            ? r.content.substring(0, MAX_LINE_LENGTH) + "... [cut]"
            : r.content;
        return `${r.filePath}:${r.lineNumber}: ${content}`;
      });

      let output = lines.join("\n");

      if (results.length > MAX_RESULTS) {
        output += `\n\n(${results.length - MAX_RESULTS} more results not shown)`;
      }

      return output;
    },
  };
}
