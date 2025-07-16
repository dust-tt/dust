import fs from "fs";
import { glob } from "glob";
import path from "path";
import { z } from "zod";

import { normalizeError } from "../../utils/errors.js";
import type { McpTool } from "../types/tools.js";

export class SearchFilesTool implements McpTool {
  name = "search_files";
  description = "Search for files matching a pattern";

  inputSchema = z.object({
    pattern: z
      .string()
      .describe(
        "File matching pattern using glob syntax. Examples: '**/*.py' (all Python files), 'docs/*.md' (Markdown in docs), '*.{js,ts}' (JS/TS files)"
      ),

    directory: z
      .string()
      .optional()
      .describe(
        "Optional: Target directory for the search operation. Directory must be an absolute directory. When not provided, searches from the current working directory"
      ),

    case_sensitive: z
      .boolean()
      .optional()
      .describe(
        "Optional: Controls whether pattern matching respects character case. Set to true for exact case matching, false otherwise (default: false)"
      ),

    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Optional: Controls the maximum count of files included in search results. Prevents overwhelming output for large directories (default: 100)"
      ),

    sort_by_modified: z
      .boolean()
      .optional()
      .describe(
        "Optional: Orders search results by file modification timestamp. When enabled, most recently modified files appear first (default: false)"
      ),
  });

  async execute({
    pattern,
    directory = process.cwd(),
    case_sensitive = false,
    limit = 100,
    sort_by_modified = false,
  }: z.infer<typeof this.inputSchema>) {
    try {
      // Use glob for proper glob pattern support.
      const globOptions = {
        cwd: directory,
        nocase: !case_sensitive,
        ignore: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/build/**",
          "**/.next/**",
          "**/coverage/**",
          "**/.nyc_output/**",
        ],
      };

      const files = await glob(pattern, globOptions);

      if (files.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No files found matching pattern: ${pattern}`,
            },
          ],
        };
      }

      // Get full paths and file stats if sorting by modification time.
      let fileResults = files.map((file) => {
        const fullPath = path.resolve(directory, file);
        return { path: fullPath, relativePath: file };
      });

      // Sort by modification time if requested.
      if (sort_by_modified) {
        const fileResultsWithMtime = await Promise.all(
          fileResults.map(async (file) => {
            try {
              const stats = await fs.promises.stat(file.path);
              return { ...file, mtime: stats.mtime };
            } catch {
              return { ...file, mtime: new Date(0) };
            }
          })
        );
        fileResults = fileResultsWithMtime.sort(
          (a, b) => b.mtime.getTime() - a.mtime.getTime()
        );
      }

      // Apply limit.
      const limitedResults = fileResults.slice(0, limit);
      const resultPaths = limitedResults.map((f) => f.relativePath);

      const resultText = `Found ${
        files.length
      } file(s) matching ${pattern} within ${directory}${
        files.length > limit ? ` (showing first ${limit})` : ""
      }${
        sort_by_modified ? " (sorted by modification time)" : ""
      }:\n${resultPaths.join("\n")}`;

      return {
        content: [
          {
            type: "text" as const,
            text: resultText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching files: ${normalizeError(error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
}
