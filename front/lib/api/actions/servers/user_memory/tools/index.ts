import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  USER_MEMORY_EDIT_TOOL_NAME,
  USER_MEMORY_READ_TOOL_NAME,
  USER_MEMORY_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/user_memory/metadata";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { getUpdatedContentAndOccurrences } from "@app/lib/api/files/utils";
import {
  exceedsUserMemoryLimit,
  MEMORY_CONTENT_TYPE,
  userMemoryPath,
} from "@app/lib/api/user_memory";
import type { Authenticator } from "@app/lib/auth";
import { MAX_USER_MEMORY_CONTENT_LENGTH } from "@app/types/api/me/memory";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

async function resolveUserMemoryFile(
  auth: Authenticator
): Promise<Result<{ fs: DustFileSystem; path: string }, MCPError>> {
  const user = auth.user();
  if (!user) {
    return new Err(
      new MCPError("No personal memory available: no user is authenticated.", {
        tracked: false,
      })
    );
  }

  const fsResult = await DustFileSystem.forUser(auth);
  if (fsResult.isErr()) {
    return new Err(new MCPError(fsResult.error.message, { tracked: false }));
  }

  return new Ok({ fs: fsResult.value, path: userMemoryPath(user.sId) });
}

const handlers: ToolHandlers<typeof USER_MEMORY_TOOLS_METADATA> = {
  [USER_MEMORY_READ_TOOL_NAME]: async (_, { auth }) => {
    const memoryResult = await resolveUserMemoryFile(auth);
    if (memoryResult.isErr()) {
      return memoryResult;
    }
    const { fs, path } = memoryResult.value;

    const readResult = await fs.readBuffer(path);
    if (readResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to read the user's personal memory: ${readResult.error.message}`
        )
      );
    }

    const content = readResult.value?.toString("utf-8") ?? "";

    return new Ok([
      {
        type: "text" as const,
        text: content.length > 0 ? content : "(memory empty)",
      },
    ]);
  },

  [USER_MEMORY_EDIT_TOOL_NAME]: async ({ oldStr, newStr }, { auth }) => {
    const memoryResult = await resolveUserMemoryFile(auth);
    if (memoryResult.isErr()) {
      return memoryResult;
    }
    const { fs, path } = memoryResult.value;

    const readResult = await fs.readBuffer(path);
    if (readResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to read the user's personal memory: ${readResult.error.message}`
        )
      );
    }
    const currentContent = readResult.value?.toString("utf-8") ?? "";

    let nextContent: string;
    if (currentContent.length === 0) {
      if (oldStr.length > 0) {
        return new Err(
          new MCPError(
            "The user's personal memory is empty. Pass an empty `oldStr` to initialize it with `newStr`.",
            { tracked: false }
          )
        );
      }
      nextContent = newStr;
    } else {
      if (oldStr.length === 0) {
        return new Err(
          new MCPError(
            "`oldStr` must not be empty when the personal memory already has content. Provide the exact text to replace.",
            { tracked: false }
          )
        );
      }

      const { updatedContent, occurrences } = getUpdatedContentAndOccurrences({
        oldString: oldStr,
        newString: newStr,
        currentContent,
      });
      if (occurrences === 0) {
        return new Err(
          new MCPError(
            "`oldStr` was not found in the user's personal memory. Read the memory first and copy an exact snippet.",
            { tracked: false }
          )
        );
      }
      if (occurrences > 1) {
        return new Err(
          new MCPError(
            `\`oldStr\` matched ${occurrences} times in the user's personal memory. Provide a longer, unique snippet.`,
            { tracked: false }
          )
        );
      }

      nextContent = updatedContent;
    }

    if (exceedsUserMemoryLimit(nextContent)) {
      return new Err(
        new MCPError(
          `Memory would exceed the ${MAX_USER_MEMORY_CONTENT_LENGTH} character limit. Shorten the content first.`,
          { tracked: false }
        )
      );
    }

    const writeResult = await fs.write(path, nextContent, MEMORY_CONTENT_TYPE);
    if (writeResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to write the user's personal memory: ${writeResult.error.message}`
        )
      );
    }

    return new Ok([
      {
        type: "text" as const,
        text:
          nextContent.length > 0
            ? `Memory updated.\n\n${nextContent}`
            : "Memory updated (now empty).",
      },
    ]);
  },
};

export const TOOLS = buildTools(USER_MEMORY_TOOLS_METADATA, handlers);
