import fs from "fs";
import path from "path";
import { z } from "zod";

import { formatFileSize } from "../../utils/fileHandling.js";
import type { McpTool } from "../types/tools.js";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".nyc_output",
]);

const MAX_ENTRIES = 500;

async function listRecursive(
  currentPath: string,
  prefix: string,
  depth: number,
  maxDepth: number,
  lines: string[],
  state: { entryCount: number; truncated: boolean }
): Promise<void> {
  if (depth > maxDepth || state.truncated) {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(currentPath, {
      withFileTypes: true,
    });
  } catch {
    return;
  }

  // Sort: directories first, then alphabetically
  const sorted = entries
    .filter((e) => !(e.isDirectory() && EXCLUDED_DIRS.has(e.name)))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) {
        return -1;
      }
      if (!a.isDirectory() && b.isDirectory()) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < sorted.length; i++) {
    if (state.entryCount >= MAX_ENTRIES) {
      state.truncated = true;
      return;
    }
    state.entryCount++;

    const entry = sorted[i];
    const isLast = i === sorted.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    if (entry.isDirectory()) {
      lines.push(`${prefix}${connector}${entry.name}/`);
      await listRecursive(
        path.join(currentPath, entry.name),
        prefix + childPrefix,
        depth + 1,
        maxDepth,
        lines,
        state
      );
    } else {
      try {
        const fileStat = await fs.promises.stat(
          path.join(currentPath, entry.name)
        );
        lines.push(
          `${prefix}${connector}${entry.name} (${formatFileSize(fileStat.size)})`
        );
      } catch {
        lines.push(`${prefix}${connector}${entry.name}`);
      }
    }
  }
}

export class ListDirectoryTool implements McpTool {
  name = "list_directory";
  description =
    "Lists the contents of a directory, showing files and subdirectories with their types and sizes. " +
    "Use this to explore project structure before diving into specific files. " +
    "Supports recursive listing with tree-style output.";

  inputSchema = z.object({
    path: z.string().describe("Absolute path to the directory to list"),
    recursive: z
      .boolean()
      .optional()
      .describe(
        "List contents recursively (default: false). When true, shows a tree structure."
      ),
    max_depth: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum depth for recursive listing (default: 3)"),
  });

  async execute({
    path: dirPath,
    recursive = false,
    max_depth = 3,
  }: z.infer<typeof this.inputSchema>) {
    const stats = await fs.promises.stat(dirPath);
    if (!stats.isDirectory()) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${dirPath} is not a directory`,
          },
        ],
        isError: true,
      };
    }

    const state = { entryCount: 0, truncated: false };

    if (!recursive) {
      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });

      // Sort: directories first, then alphabetically
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) {
          return -1;
        }
        if (!a.isDirectory() && b.isDirectory()) {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });

      const lines: string[] = [];
      for (const entry of sorted) {
        if (state.entryCount >= MAX_ENTRIES) {
          state.truncated = true;
          break;
        }
        state.entryCount++;

        if (entry.isDirectory()) {
          lines.push(`[DIR]  ${entry.name}/`);
        } else {
          try {
            const fileStat = await fs.promises.stat(
              path.join(dirPath, entry.name)
            );
            lines.push(
              `[FILE] ${entry.name} (${formatFileSize(fileStat.size)})`
            );
          } catch {
            lines.push(`[FILE] ${entry.name}`);
          }
        }
      }

      let output = `Contents of ${dirPath}:\n\n${lines.join("\n")}`;
      if (state.truncated) {
        output += `\n\n[Output truncated: showing first ${MAX_ENTRIES} of ${entries.length} entries]`;
      }

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }

    // Recursive tree listing
    const lines: string[] = [];
    await listRecursive(dirPath, "", 1, max_depth, lines, state);

    let output = `${dirPath}/\n${lines.join("\n")}`;
    if (state.truncated) {
      output += `\n\n[Output truncated at ${MAX_ENTRIES} entries. Use a more specific path or reduce max_depth.]`;
    }

    return {
      content: [{ type: "text" as const, text: output }],
    };
  }
}
