import { glob as globFn } from "glob";
import path from "path";
import { stat } from "fs/promises";

import type { Tool, ToolContext } from "./index.js";

const DEFAULT_LIMIT = 100;
const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
];

export function globTool(context: ToolContext): Tool {
  return {
    name: "glob",
    description:
      "Find files matching a glob pattern. Returns file paths sorted by modification time. " +
      'Examples: "**/*.ts", "src/**/*.tsx", "package.json".',
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The glob pattern to match files against.",
        },
        directory: {
          type: "string",
          description: "Directory to search in. Default: project root.",
        },
        limit: {
          type: "number",
          description: `Maximum number of results. Default: ${DEFAULT_LIMIT}.`,
        },
      },
      required: ["pattern"],
    },
    async execute(input) {
      const pattern = input.pattern as string;
      const directory = (input.directory as string)
        ? path.resolve(context.cwd, input.directory as string)
        : context.cwd;
      const limit = (input.limit as number) ?? DEFAULT_LIMIT;

      const files = await globFn(pattern, {
        cwd: directory,
        ignore: DEFAULT_EXCLUDES,
        nodir: true,
        absolute: false,
      });

      if (files.length === 0) {
        return "No files found matching the pattern.";
      }

      // Sort by modification time (most recent first).
      const filesWithStats = await Promise.all(
        files.slice(0, limit * 2).map(async (f) => {
          const fullPath = path.resolve(directory, f);
          try {
            const s = await stat(fullPath);
            return { file: f, mtimeMs: s.mtimeMs };
          } catch {
            return { file: f, mtimeMs: 0 };
          }
        })
      );

      filesWithStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
      const limited = filesWithStats.slice(0, limit);

      let result = limited.map((f) => f.file).join("\n");

      if (files.length > limit) {
        result += `\n\n(${files.length - limit} more files not shown)`;
      }

      return result;
    },
  };
}
