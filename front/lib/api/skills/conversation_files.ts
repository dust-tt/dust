import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { SCOPED_PREFIX_CONVERSATION } from "@app/lib/api/file_system/types";
import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import streamConsumers from "stream/consumers";

/**
 * Copy a skill's file attachments into the conversation's file system under
 * `skills/{skillName}/{fileName}` (skill names are unique per workspace).
 *
 * Writing through DustFileSystem (rather than the sandbox filesystem) makes the files visible
 * everywhere the conversation files are: the `files__*` tools, the sandbox gcsfuse mount
 * (`/files/conversation-{cId}/skills/...`), the conversation files panel, and conversation
 * branching copies. The write is idempotent: re-enabling a skill overwrites the same paths.
 *
 * Returns the canonical scoped paths (`conversation-{cId}/skills/...`) of the loaded files, as
 * surfaced by the `files__list` tool.
 */
export async function loadSkillFilesToConversation(
  auth: Authenticator,
  {
    skill,
    conversation,
  }: {
    skill: SkillResource;
    conversation: ConversationWithoutContentType;
  }
): Promise<Result<{ loadedPaths: string[] }, Error>> {
  const fileAttachments = skill.getFileAttachments();
  if (fileAttachments.length === 0) {
    return new Ok({ loadedPaths: [] });
  }

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return fsResult;
  }
  const fileSystem = fsResult.value;

  const loadedPaths: string[] = [];

  for (const file of fileAttachments) {
    const scopedPath =
      `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/` +
      `skills/${skill.name}/${file.fileName}`;

    let content: Buffer;
    try {
      content = await streamConsumers.buffer(
        file.getReadStream({ auth, version: "original" })
      );
    } catch (err) {
      return new Err(normalizeError(err));
    }

    const writeResult = await fileSystem.write(
      scopedPath,
      content,
      file.contentType
    );
    if (writeResult.isErr()) {
      return writeResult;
    }

    loadedPaths.push(scopedPath);
  }

  return new Ok({ loadedPaths });
}
