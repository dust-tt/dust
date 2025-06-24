import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DustMcpServerTransport } from "@dust-tt/client";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";

import { getDustClient } from "./dustClient.js";
import { normalizeError } from "./errors.js";

/**
 * Client-side MCP server that provides file system interaction tools
 * This connects to Dust's MCP infrastructure and exposes local file system operations
 */
export async function startFsMcpServer(
  serverName: string = "Dust CLI File System",
  onServerIdReceived?: (serverId: string) => void
) {
  const dustClient = await getDustClient();
  if (!dustClient) {
    throw new Error("Dust client not initialized. Please run 'dust login'.");
  }

  // Create the MCP server
  const server = new McpServer({
    name: "dust-cli-fs-mcp-server",
    version: process.env.npm_package_version || "0.1.0",
  });

  // File read tool
  server.tool(
    "read_file",
    "Read the contents of a file from the local file system",
    {
      path: z
        .string()
        .describe("The absolute or relative path to the file to read"),
    },
    async ({ path: filePath }: { path: string }) => {
      try {
        const absolutePath = path.resolve(filePath);
        const content = await fs.readFile(absolutePath, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: `File: ${absolutePath}\n\n${content}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = `Failed to read file ${filePath}: ${
          normalizeError(error).message
        }`;
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
        };
      }
    }
  );

  // File write tool
  server.tool(
    "write_file",
    "Write content to a file in the local file system",
    {
      path: z
        .string()
        .describe("The absolute or relative path to the file to write"),
      content: z.string().describe("The content to write to the file"),
    },
    async ({ path: filePath, content }: { path: string; content: string }) => {
      try {
        const absolutePath = path.resolve(filePath);
        await fs.writeFile(absolutePath, content, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: `Successfully wrote ${content.length} characters to ${absolutePath}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = `Failed to write file ${filePath}: ${
          normalizeError(error).message
        }`;
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
        };
      }
    }
  );

  // Directory listing tool
  server.tool(
    "list_directory",
    "List the contents of a directory",
    {
      path: z
        .string()
        .describe("The absolute or relative path to the directory to list"),
      recursive: z
        .boolean()
        .optional()
        .describe("Whether to list recursively (default: false)"),
    },
    async ({
      path: dirPath,
      recursive = false,
    }: {
      path: string;
      recursive?: boolean;
    }) => {
      try {
        const absolutePath = path.resolve(dirPath);

        if (recursive) {
          const files = await glob("**/*", {
            cwd: absolutePath,
            dot: true,
            stat: true,
          });
          const fileList = files.map((file) => {
            const fullPath = path.join(absolutePath, file);
            return `${file} (${fs
              .stat(fullPath)
              .then((stats) => (stats.isDirectory() ? "directory" : "file"))
              .catch(() => "unknown")})`;
          });
          return {
            content: [
              {
                type: "text",
                text: `Directory: ${absolutePath} (recursive)\n\n${(
                  await Promise.all(fileList)
                ).join("\n")}`,
              },
            ],
          };
        } else {
          const entries = await fs.readdir(absolutePath, {
            withFileTypes: true,
          });
          const fileList = entries.map(
            (entry) =>
              `${entry.name} (${entry.isDirectory() ? "directory" : "file"})`
          );
          return {
            content: [
              {
                type: "text",
                text: `Directory: ${absolutePath}\n\n${fileList.join("\n")}`,
              },
            ],
          };
        }
      } catch (error) {
        const errorMessage = `Failed to list directory ${dirPath}: ${
          normalizeError(error).message
        }`;
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
        };
      }
    }
  );

  // File search tool
  server.tool(
    "search_files",
    "Search for files matching a pattern",
    {
      pattern: z
        .string()
        .describe(
          "Glob pattern to search for files (e.g., '**/*.ts', '*.json')"
        ),
      directory: z
        .string()
        .optional()
        .describe("Directory to search in (default: current directory)"),
    },
    async ({
      pattern,
      directory = ".",
    }: {
      pattern: string;
      directory?: string;
    }) => {
      try {
        const searchDir = path.resolve(directory);
        const files = await glob(pattern, {
          cwd: searchDir,
          absolute: true,
          dot: true,
        });

        if (files.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No files found matching pattern '${pattern}' in ${searchDir}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Found ${
                files.length
              } files matching '${pattern}' in ${searchDir}:\n\n${files.join(
                "\n"
              )}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = `Failed to search files with pattern ${pattern}: ${
          normalizeError(error).message
        }`;
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
        };
      }
    }
  );

  // File info tool
  server.tool(
    "file_info",
    "Get information about a file or directory",
    {
      path: z
        .string()
        .describe("The absolute or relative path to get information about"),
    },
    async ({ path: filePath }: { path: string }) => {
      try {
        const absolutePath = path.resolve(filePath);
        const stats = await fs.stat(absolutePath);

        const info = {
          path: absolutePath,
          type: stats.isDirectory()
            ? "directory"
            : stats.isFile()
            ? "file"
            : "other",
          size: stats.isFile() ? `${stats.size} bytes` : "N/A",
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString(),
          permissions: stats.mode.toString(8),
        };

        return {
          content: [
            {
              type: "text",
              text: `File Information:\n${Object.entries(info)
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n")}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = `Failed to get file info for ${filePath}: ${
          normalizeError(error).message
        }`;
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
        };
      }
    }
  );

  // Create directory tool
  server.tool(
    "create_directory",
    "Create a new directory",
    {
      path: z
        .string()
        .describe("The absolute or relative path of the directory to create"),
      recursive: z
        .boolean()
        .optional()
        .describe(
          "Whether to create parent directories if they don't exist (default: false)"
        ),
    },
    async ({
      path: dirPath,
      recursive = false,
    }: {
      path: string;
      recursive?: boolean;
    }) => {
      try {
        const absolutePath = path.resolve(dirPath);
        await fs.mkdir(absolutePath, { recursive });
        return {
          content: [
            {
              type: "text",
              text: `Successfully created directory: ${absolutePath}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = `Failed to create directory ${dirPath}: ${
          normalizeError(error).message
        }`;
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
        };
      }
    }
  );

  // Delete file/directory tool
  server.tool(
    "delete_path",
    "Delete a file or directory",
    {
      path: z.string().describe("The absolute or relative path to delete"),
      recursive: z
        .boolean()
        .optional()
        .describe("Whether to delete directories recursively (default: false)"),
    },
    async ({
      path: targetPath,
      recursive = false,
    }: {
      path: string;
      recursive?: boolean;
    }) => {
      try {
        const absolutePath = path.resolve(targetPath);
        const stats = await fs.stat(absolutePath);

        if (stats.isDirectory()) {
          await fs.rmdir(absolutePath, { recursive });
          return {
            content: [
              {
                type: "text",
                text: `Successfully deleted directory: ${absolutePath}`,
              },
            ],
          };
        } else {
          await fs.unlink(absolutePath);
          return {
            content: [
              {
                type: "text",
                text: `Successfully deleted file: ${absolutePath}`,
              },
            ],
          };
        }
      } catch (error) {
        const errorMessage = `Failed to delete ${targetPath}: ${
          normalizeError(error).message
        }`;
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
        };
      }
    }
  );

  // Create the transport that connects to Dust's MCP infrastructure
  const transport = new DustMcpServerTransport(
    dustClient,
    (serverId: string) => {
      onServerIdReceived?.(serverId);
    },
    serverName
  );

  // Connect the server to the transport
  await server.connect(transport);

  // Graceful shutdown handler
  const shutdown = async () => {
    console.error("Shutting down file system MCP server...");
    try {
      await server.close();
      console.error("File system MCP server closed.");
      process.exit(0);
    } catch (error) {
      console.error("Error closing file system MCP server:", error);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return {
    server,
    transport,
    shutdown,
  };
}
