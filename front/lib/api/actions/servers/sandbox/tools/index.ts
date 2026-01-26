import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

import { generatePlainTextFile } from "@app/lib/actions/action_file_helpers";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolGeneratedFileType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SANDBOX_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox/metadata";
import { getSandboxPoolManager } from "@app/lib/api/sandbox";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { Err, normalizeError, Ok } from "@app/types";

const MAX_SNIPPET_CHARS = 16384;

/**
 * Generate a snippet (first N characters) from content.
 */
function generateSnippet(
  content: string,
  maxChars: number = MAX_SNIPPET_CHARS
): string {
  if (content.length <= maxChars) {
    return content;
  }
  return (
    content.substring(0, maxChars) +
    `\n...(truncated, ${content.length - maxChars} more characters)`
  );
}

/**
 * Get the session ID for sandbox pool from the agent loop context.
 * Uses the conversation sId as the session identifier.
 */
function getSessionId(agentLoopContext?: AgentLoopContextType): string {
  if (agentLoopContext?.runContext) {
    return agentLoopContext.runContext.conversation.sId;
  }
  if (agentLoopContext?.listToolsContext) {
    return agentLoopContext.listToolsContext.conversation.sId;
  }
  // Fallback: generate a random session ID (shouldn't happen in normal operation)
  return `sandbox-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Get the conversation ID from the agent loop context.
 */
function getConversationId(agentLoopContext?: AgentLoopContextType): string {
  if (agentLoopContext?.runContext) {
    return agentLoopContext.runContext.conversation.sId;
  }
  if (agentLoopContext?.listToolsContext) {
    return agentLoopContext.listToolsContext.conversation.sId;
  }
  return "unknown";
}

export function createSandboxTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const poolManager = getSandboxPoolManager();
  const sessionId = getSessionId(agentLoopContext);
  const conversationId = getConversationId(agentLoopContext);

  const handlers: ToolHandlers<typeof SANDBOX_TOOLS_METADATA> = {
    execute: async ({ command, workingDirectory, timeoutMs }) => {
      try {
        logger.info({ sessionId, command }, "[sandbox-tool] Executing command");

        const sandbox = await poolManager.acquire(sessionId);

        // Build the command with optional working directory
        let fullCommand = command;
        if (workingDirectory) {
          fullCommand = `cd "${workingDirectory}" && ${command}`;
        }

        const result = await sandbox.exec(fullCommand);

        const output = [
          `Exit code: ${result.exitCode}`,
          result.stdout ? `\n--- stdout ---\n${result.stdout}` : "",
          result.stderr ? `\n--- stderr ---\n${result.stderr}` : "",
        ].join("");

        return new Ok([
          {
            type: "text" as const,
            text: `Command executed with exit code ${result.exitCode}`,
          },
          {
            type: "text" as const,
            text: output,
          },
        ]);
      } catch (e) {
        logger.error(
          { sessionId, command, err: e },
          "[sandbox-tool] Execute failed"
        );
        return new Err(
          new MCPError(
            `Failed to execute command: ${normalizeError(e).message}`
          )
        );
      }
    },

    write_file: async ({ path, content }) => {
      try {
        logger.info(
          { sessionId, path, contentLength: content.length },
          "[sandbox-tool] Writing file"
        );

        const sandbox = await poolManager.acquire(sessionId);
        await sandbox.writeFile(path, content);

        return new Ok([
          {
            type: "text" as const,
            text: `File written successfully to ${path} (${content.length} bytes)`,
          },
        ]);
      } catch (e) {
        logger.error(
          { sessionId, path, err: e },
          "[sandbox-tool] Write file failed"
        );
        return new Err(
          new MCPError(`Failed to write file: ${normalizeError(e).message}`)
        );
      }
    },

    read_file: async ({ path }) => {
      try {
        logger.info({ sessionId, path }, "[sandbox-tool] Reading file");

        const sandbox = await poolManager.acquire(sessionId);
        const contentBuffer = await sandbox.readFile(path);
        const content = contentBuffer.toString("utf-8");

        // Generate snippet for display
        const snippet = generateSnippet(content);

        // Create a Dust file resource for the content
        const fileName = path.split("/").pop() || "file.txt";
        const file = await generatePlainTextFile(auth, {
          title: fileName,
          conversationId,
          content,
          snippet,
        });

        // Return as a tool-generated file resource
        const fileOutput: ToolGeneratedFileType = {
          text: `File read: ${path} (${content.length} bytes)`,
          uri: file.getPublicUrl(auth),
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
          fileId: file.sId,
          title: fileName,
          contentType: "text/plain",
          snippet,
        };

        return new Ok([
          {
            type: "resource" as const,
            resource: fileOutput,
          },
        ]);
      } catch (e) {
        logger.error(
          { sessionId, path, err: e },
          "[sandbox-tool] Read file failed"
        );
        return new Err(
          new MCPError(`Failed to read file: ${normalizeError(e).message}`)
        );
      }
    },

    list_files: async ({ path = "/tmp", recursive = false }) => {
      try {
        logger.info(
          { sessionId, path, recursive },
          "[sandbox-tool] Listing files"
        );

        const sandbox = await poolManager.acquire(sessionId);
        const files = await sandbox.listFiles(path, recursive);

        const output = files
          .map((f) => {
            const typeIcon = f.type === "directory" ? "[DIR]" : "[FILE]";
            const size = f.size !== undefined ? ` (${f.size} bytes)` : "";
            return `${typeIcon} ${f.name}${size}`;
          })
          .join("\n");

        return new Ok([
          {
            type: "text" as const,
            text: `Found ${files.length} items in ${path}`,
          },
          {
            type: "text" as const,
            text: output || "(empty directory)",
          },
        ]);
      } catch (e) {
        logger.error(
          { sessionId, path, err: e },
          "[sandbox-tool] List files failed"
        );
        return new Err(
          new MCPError(`Failed to list files: ${normalizeError(e).message}`)
        );
      }
    },

    push_file_to_dust: async ({ path, title }) => {
      try {
        logger.info(
          { sessionId, path, title },
          "[sandbox-tool] Pushing file to Dust"
        );

        const sandbox = await poolManager.acquire(sessionId);
        const contentBuffer = await sandbox.readFile(path);
        const content = contentBuffer.toString("utf-8");

        // Use provided title or extract from path
        const fileName = title || path.split("/").pop() || "file.txt";
        const snippet = generateSnippet(content);

        // Create a Dust file resource
        const file = await generatePlainTextFile(auth, {
          title: fileName,
          conversationId,
          content,
          snippet,
        });

        // Return as a tool-generated file resource
        const fileOutput: ToolGeneratedFileType = {
          text: `File pushed: ${fileName} (${content.length} bytes)`,
          uri: file.getPublicUrl(auth),
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
          fileId: file.sId,
          title: fileName,
          contentType: "text/plain",
          snippet,
        };

        return new Ok([
          {
            type: "resource" as const,
            resource: fileOutput,
          },
        ]);
      } catch (e) {
        logger.error(
          { sessionId, path, err: e },
          "[sandbox-tool] Push file to Dust failed"
        );
        return new Err(
          new MCPError(
            `Failed to push file to Dust: ${normalizeError(e).message}`
          )
        );
      }
    },
  };

  return buildTools(SANDBOX_TOOLS_METADATA, handlers);
}
