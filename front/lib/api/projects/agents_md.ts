import { DustFileSystem } from "@app/lib/api/file_system";
import {
  getPodAgentsMdScopedPath,
  POD_AGENTS_MD_MAX_CHARACTER_COUNT,
} from "@app/lib/api/projects/constants";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { DustFileSystemError } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function readPodAgentsMdContent(
  auth: Authenticator,
  podId: string
): Promise<string | null> {
  const scopedPath = getPodAgentsMdScopedPath(podId);
  const fsResult = await DustFileSystem.fromScopedPath(auth, scopedPath);
  if (fsResult.isErr()) {
    if (fsResult.error.code !== "not_found") {
      logger.warn(
        { err: fsResult.error, scopedPath },
        "Failed to open file system for Pod AGENTS.md"
      );
    }
    return null;
  }

  const readResult = await fsResult.value.readBuffer(scopedPath);
  if (readResult.isErr()) {
    logger.warn(
      { err: readResult.error, scopedPath },
      "Failed to read Pod AGENTS.md"
    );
    return null;
  }

  if (readResult.value === null) {
    return null;
  }

  const content = readResult.value.toString("utf8").trim();
  if (!content) {
    return null;
  }

  if (content.length > POD_AGENTS_MD_MAX_CHARACTER_COUNT) {
    return content.slice(0, POD_AGENTS_MD_MAX_CHARACTER_COUNT);
  }

  return content;
}

export async function writePodAgentsMdContent(
  auth: Authenticator,
  podId: string,
  content: string
): Promise<Result<void, DustFileSystemError>> {
  if (content.length > POD_AGENTS_MD_MAX_CHARACTER_COUNT) {
    return new Err(
      new DustFileSystemError(
        "invalid_path",
        `Instructions must be ${POD_AGENTS_MD_MAX_CHARACTER_COUNT} characters or fewer.`
      )
    );
  }

  const scopedPath = getPodAgentsMdScopedPath(podId);
  const fsResult = await DustFileSystem.fromScopedPath(auth, scopedPath);
  if (fsResult.isErr()) {
    return fsResult;
  }

  const writeResult = await fsResult.value.write(
    scopedPath,
    content,
    "text/markdown"
  );
  if (writeResult.isErr()) {
    return writeResult;
  }

  return new Ok(undefined);
}

export function formatPodAgentsMdPromptSection(content: string): string {
  return `
## Pod agent instructions (AGENTS.md)

The Pod maintainers configured these instructions for all agents in this Pod.
Follow them when relevant.

<file_content>
${content}
</file_content>
`;
}
