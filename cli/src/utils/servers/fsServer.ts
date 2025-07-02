import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { execSync } from "child_process";
import type { Request, Response } from "express";
import express from "express";
import fs from "fs/promises";
import http from "http";
import path from "path";
import { z } from "zod";

import { normalizeError } from "../errors.js";
const server = new McpServer({
  name: "fs-cli",
  version: process.env.npm_package_version || "0.1.0",
});

// Add local development tools to the MCP server
export const startFsServer = async (
  onServerStart: (url: string) => void,
  requestedPort?: number
) => {
  const app = express();

  const activeSessions = new Map<
    string,
    { server: McpServer; transport: SSEServerTransport }
  >();

  app.get("/sse", async (req: Request, res: Response) => {
    console.error(
      `[SSE] Connection request from ${req.ip} for ${req.originalUrl}`
    );

    let transport: SSEServerTransport | undefined = undefined;
    let sessionId: string | undefined = undefined;

    try {
      // Configure socket for long-lived SSE connection
      req.socket.setTimeout(0);
      req.socket.setNoDelay(true);
      req.socket.setKeepAlive(true);

      transport = new SSEServerTransport("/message", res);
      sessionId = transport.sessionId;
      console.error(`[SSE] Session ${sessionId} created`);

      const server = new McpServer({
        name: "dust-cli-mcp-server",
        version: process.env.npm_package_version || "0.1.0",
      });

      // add tools here
      // File operations
      server.tool(
        "list_files",
        "List files and directories in a given path",
        {
          path: z.string().describe("The directory path to list"),
          include_hidden: z
            .boolean()
            .optional()
            .describe("Include hidden files (default: false)"),
        },
        async ({ path: dirPath, include_hidden = false }) => {
          try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            const items = entries
              .filter((entry) => include_hidden || !entry.name.startsWith("."))
              .map((entry) => ({
                name: entry.name,
                type: entry.isDirectory() ? "directory" : "file",
                path: path.join(dirPath, entry.name),
              }));

            return {
              content: [
                {
                  type: "text",
                  text: `Files in ${dirPath}:\n${items
                    .map(
                      (item) =>
                        `${item.type === "directory" ? "📁" : "📄"} ${
                          item.name
                        }`
                    )
                    .join("\n")}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error listing files: ${normalizeError(error).message}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "read_file",
        "Read the contents of a file",
        {
          path: z.string().describe("The file path to read"),
          encoding: z
            .enum(["utf8", "base64"])
            .optional()
            .describe("File encoding (default: utf8)"),
        },
        async ({ path: filePath, encoding = "utf8" }) => {
          try {
            const content = await fs.readFile(filePath, encoding);
            return {
              content: [
                {
                  type: "text",
                  text:
                    encoding === "base64"
                      ? content
                      : `File: ${filePath}\n\n${content}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error reading file: ${normalizeError(error).message}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "write_file",
        "Write content to a file",
        {
          path: z.string().describe("The file path to write to"),
          content: z.string().describe("The content to write"),
          encoding: z
            .enum(["utf8", "base64"])
            .optional()
            .describe("File encoding (default: utf8)"),
        },
        async ({ path: filePath, content, encoding = "utf8" }) => {
          try {
            await fs.writeFile(filePath, content, encoding);
            return {
              content: [
                { type: "text", text: `Successfully wrote to ${filePath}` },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error writing file: ${normalizeError(error).message}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "create_directory",
        "Create a new directory",
        {
          path: z.string().describe("The directory path to create"),
          recursive: z
            .boolean()
            .optional()
            .describe(
              "Create parent directories if they don't exist (default: true)"
            ),
        },
        async ({ path: dirPath, recursive = true }) => {
          try {
            await fs.mkdir(dirPath, { recursive });
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully created directory ${dirPath}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error creating directory: ${
                    normalizeError(error).message
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "delete_file",
        "Delete a file or directory",
        {
          path: z.string().describe("The file or directory path to delete"),
          recursive: z
            .boolean()
            .optional()
            .describe("Delete directories recursively (default: false)"),
        },
        async ({ path: targetPath, recursive = false }) => {
          try {
            const stats = await fs.stat(targetPath);
            if (stats.isDirectory()) {
              await fs.rm(targetPath, { recursive, force: true });
            } else {
              await fs.unlink(targetPath);
            }
            return {
              content: [
                { type: "text", text: `Successfully deleted ${targetPath}` },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error deleting: ${normalizeError(error).message}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Development utilities
      server.tool(
        "search_files",
        "Search for files matching a pattern",
        {
          pattern: z
            .string()
            .describe("The search pattern (supports glob patterns)"),
          directory: z
            .string()
            .optional()
            .describe("Directory to search in (default: current directory)"),
          case_sensitive: z
            .boolean()
            .optional()
            .describe("Case sensitive search (default: false)"),
        },
        async ({ pattern, directory = ".", case_sensitive = false }) => {
          try {
            const flags = case_sensitive ? "" : "-i";
            const cmd = `find "${directory}" -name "${pattern}" ${flags} -type f`;
            const output = execSync(cmd, { encoding: "utf8" });
            const files = output
              .trim()
              .split("\n")
              .filter((f) => f);

            return {
              content: [
                {
                  type: "text",
                  text:
                    files.length > 0
                      ? `Found ${files.length} files:\n${files.join("\n")}`
                      : `No files found matching pattern: ${pattern}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error searching files: ${
                    normalizeError(error).message
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "search_content",
        "Search for content within files",
        {
          query: z.string().describe("The text to search for"),
          directory: z
            .string()
            .optional()
            .describe("Directory to search in (default: current directory)"),
          file_pattern: z
            .string()
            .optional()
            .describe("File pattern to search within (default: all files)"),
          case_sensitive: z
            .boolean()
            .optional()
            .describe("Case sensitive search (default: false)"),
        },
        async ({
          query,
          directory = ".",
          file_pattern = "*",
          case_sensitive = false,
        }) => {
          try {
            const flags = case_sensitive ? "" : "-i";
            const cmd = `grep -r ${flags} --include="${file_pattern}" "${query}" "${directory}"`;
            const output = execSync(cmd, { encoding: "utf8" });

            return {
              content: [
                {
                  type: "text",
                  text: output.trim() || `No matches found for: ${query}`,
                },
              ],
            };
          } catch (error: unknown) {
            // grep returns exit code 1 when no matches found
            if (
              error &&
              typeof error === "object" &&
              "status" in error &&
              error.status === 1
            ) {
              return {
                content: [
                  { type: "text", text: `No matches found for: ${query}` },
                ],
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: `Error searching content: ${
                    normalizeError(error).message
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "get_current_directory",
        "Get the current working directory",
        {},
        async () => {
          try {
            const cwd = process.cwd();
            return {
              content: [{ type: "text", text: `Current directory: ${cwd}` }],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting current directory: ${
                    normalizeError(error).message
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "execute_command",
        "Execute a shell command (use with caution)",
        {
          command: z.string().describe("The shell command to execute"),
          working_directory: z
            .string()
            .optional()
            .describe("Working directory for the command"),
        },
        async ({ command, working_directory }) => {
          try {
            const options = working_directory
              ? { cwd: working_directory, encoding: "utf8" as const }
              : { encoding: "utf8" as const };
            const output = execSync(command, options);
            return {
              content: [
                {
                  type: "text",
                  text: `Command: ${command}\n\nOutput:\n${output}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error executing command: ${
                    normalizeError(error).message
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Git operations
      server.tool(
        "git_status",
        "Get git repository status",
        {
          repository_path: z
            .string()
            .optional()
            .describe("Path to git repository (default: current directory)"),
        },
        async ({ repository_path = "." }) => {
          try {
            const output = execSync("git status --porcelain", {
              cwd: repository_path,
              encoding: "utf8",
            });
            return {
              content: [
                {
                  type: "text",
                  text: output.trim() || "Working directory clean",
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting git status: ${
                    normalizeError(error).message
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "git_diff",
        "Get git diff",
        {
          repository_path: z
            .string()
            .optional()
            .describe("Path to git repository (default: current directory)"),
          file_path: z
            .string()
            .optional()
            .describe("Specific file to diff (optional)"),
          staged: z
            .boolean()
            .optional()
            .describe("Show staged changes (default: false)"),
        },
        async ({ repository_path = ".", file_path, staged = false }) => {
          try {
            let cmd = staged ? "git diff --cached" : "git diff";
            if (file_path) {
              cmd += ` "${file_path}"`;
            }

            const output = execSync(cmd, {
              cwd: repository_path,
              encoding: "utf8",
            });
            return {
              content: [
                {
                  type: "text",
                  text: output.trim() || "No differences found",
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting git diff: ${
                    normalizeError(error).message
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "git_log",
        "Get git commit log",
        {
          repository_path: z
            .string()
            .optional()
            .describe("Path to git repository (default: current directory)"),
          limit: z
            .number()
            .optional()
            .describe("Number of commits to show (default: 10)"),
          oneline: z
            .boolean()
            .optional()
            .describe("Show one line per commit (default: true)"),
        },
        async ({ repository_path = ".", limit = 10, oneline = true }) => {
          try {
            const format = oneline ? "--oneline" : "";
            const cmd = `git log ${format} -n ${limit}`;

            const output = execSync(cmd, {
              cwd: repository_path,
              encoding: "utf8",
            });
            return {
              content: [
                {
                  type: "text",
                  text: output.trim() || "No commits found",
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting git log: ${
                    normalizeError(error).message
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );
      // Store session
      if (sessionId) {
        activeSessions.set(sessionId, { server, transport });
      }

      res.on("close", () => {
        if (sessionId) {
          console.error(`[SSE] Server connected for session ${sessionId}`);
          activeSessions.delete(sessionId);
        }
      });

      await server.connect(transport);
      console.error(`[SSE] Server connected for session ${sessionId}`);
    } catch (error) {
      console.error(`[SSE] Error handling connection: ${sessionId}`);
      if (!res.headersSent) {
        res.status(500).end(`Failed to establish SSE connection: ${error}`);
      } else {
        res.end();
      }
      if (sessionId) {
        activeSessions.delete(sessionId);
      }
    }
  });

  // Message handling endpoint
  app.post("/message", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;

    try {
      if (!sessionId) {
        res.status(400).send("Missing sessionId query parameter");
        return;
      }

      const session = activeSessions.get(sessionId);
      if (!session) {
        res.status(404).send(`Session not found: ${sessionId}`);
        return;
      }

      session.transport.handlePostMessage(req, res).catch((handlerError) => {
        console.error(
          `[POST /message] Error handling message for session ${sessionId}:`,
          handlerError
        );
        if (!res.headersSent) {
          res.status(500).send("Error processing message");
        }
      });
    } catch (error) {
      console.error(
        `[POST /message] Error handling message for session ${sessionId}:`,
        error
      );
      if (!res.headersSent) {
        res.status(500).send("Error processing message");
      }
    }
  });

  const httpServer = http.createServer(app);

  const startHttpServer = (port = requestedPort || 0): Promise<number> =>
    new Promise((resolve, reject) => {
      httpServer.once("error", (err: Error & { code?: string }) => {
        if (requestedPort && err.code === "EADDRINUSE") {
          reject(new Error(`Port ${requestedPort} is already in use.`));
        } else if (err.code === "EADDRINUSE") {
          console.error(`Port ${port} in use, trying another...`);
          setTimeout(() => startHttpServer(0).then(resolve, reject), 100);
        } else {
          reject(err);
        }
      });

      httpServer.listen(port, () => {
        const address = httpServer.address();
        const boundPort = typeof address === "string" ? 0 : address?.port ?? 0;
        resolve(boundPort);
      });
    });

  try {
    const port = await startHttpServer();
    const url = `http://localhost:${port}/sse`;
    console.error(`HTTP server listening on port ${port}`);
    onServerStart(url);

    // Graceful shutdown handler
    const shutdown = async () => {
      console.error("Shutting down HTTP server...");
      for (const [sessionId, session] of activeSessions) {
        try {
          await session.server.close();
          console.error(`Closed session ${sessionId}`);
        } catch (error) {
          console.error(`Error closing session ${sessionId}:`, error);
        }
      }

      httpServer.close((err) => {
        if (err) {
          console.error("Error closing HTTP server:", err);
          process.exit(1);
        } else {
          console.error("HTTP server closed.");
          process.exit(0);
        }
      });
    };

    // Register shutdown handlers
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Fatal HTTP server error:", error);
    process.exit(1);
  }
  return server;
};
