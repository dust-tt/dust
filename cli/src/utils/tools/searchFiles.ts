import fs from "fs";
import { glob } from "glob";
import path from "path";
import { z } from "zod";

import { normalizeError } from "../errors.js";
import type { McpTool } from "../types/tool.js";

export class SearchFilesTool implements McpTool {
  name = "search_files";
  description = "Search for files matching a pattern";

  // prompts gotten from Google's Gemini
  inputSchema = z.object({
    pattern: z
      .string()
      .describe(
        "The glob pattern to match against (e.g., '**/*.py', 'docs/*.md', '*.{js,ts}')."
      ),
    directory: z
      .string()
      .optional()
      .describe(
        "Optional: The absolute path to the directory to search within. If omitted, searches the current directory"
      ),
    case_sensitive: z
      .boolean()
      .optional()
      .describe(
        "Optional: Whether the search should be case-sensitive. Defaults to false."
      ),
    limit: z
      .number()
      .optional()
      .describe(
        "Optional: Maximum number of files to return. Defaults to 100."
      ),
    sort_by_modified: z
      .boolean()
      .optional()
      .describe(
        "Optional: Whether to sort results by modification time (newest first). Defaults to false."
      ),
  });

  // API gotten from Google's Gemini
  async execute({
    pattern,
    directory = ".",
    case_sensitive = false,
    limit = 100,
    sort_by_modified = false,
  }: z.infer<typeof this.inputSchema>) {
    try {
      // Use glob for proper glob pattern support
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

      // Get full paths and file stats if sorting by modification time
      let fileResults = files.map((file) => {
        const fullPath = path.resolve(directory, file);
        return { path: fullPath, relativePath: file };
      });

      // Sort by modification time if requested
      if (sort_by_modified) {
        fileResults = fileResults
          .map((file) => {
            try {
              const stats = fs.statSync(file.path);
              return { ...file, mtime: stats.mtime };
            } catch {
              return { ...file, mtime: new Date(0) };
            }
          })
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      }

      // Apply limit
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
