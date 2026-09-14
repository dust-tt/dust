import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { conversationScopedPath } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Readable } from "stream";

// A skill file ready to be written into a conversation, regardless of whether it
// came from a database-backed `FileResource` (custom skills) or was declared
// inline by a code-defined skill.
//
// `getContent` is only invoked when the file is confirmed missing from the conversation mount, so
// a file already present is never re-read: no wasted GCS read stream for `FileResource` attachments.
type WritableSkillFile = {
  fileName: string;
  contentType: string;
  getContent: () => Readable | string;
};

/**
 * Copy a skill's files into the conversation's file system under
 * `skills/{skillName}/{fileName}` (skill names are unique per workspace).
 *
 * This handles both file sources uniformly: database-backed `FileResource`
 * attachments (custom skills) and inline files declared by code-defined skills.
 * From the model's, the `files__*` tools', and the sandbox's point of view they
 * are indistinguishable once written.
 *
 * Writing through DustFileSystem (rather than the sandbox filesystem) makes the files visible
 * everywhere the conversation files are: the `files__*` tools, the sandbox gcsfuse mount
 * (`/files/conversation-{cId}/skills/...`), the conversation files panel, and conversation
 * branching copies. Idempotent: files already present at their deterministic path are left
 * untouched, and re-enabling a skill only writes whatever is still missing. All-or-nothing per
 * call: if a write fails partway, the files written by this call are deleted so the agent never
 * sees a half-mounted skill; files that were already present before this call are left alone.
 *
 * Returns the canonical scoped paths (`conversation-{cId}/skills/...`) of the loaded files, as
 * surfaced by the `files__list` tool.
 */
export async function upsertSkillFilesToConversation(
  auth: Authenticator,
  {
    skill,
    conversation,
  }: {
    skill: SkillResource;
    conversation: ConversationWithoutContentType;
  }
): Promise<Result<{ loadedPaths: string[] }, Error>> {
  const files: WritableSkillFile[] = [
    ...skill.getFileAttachments().map((file) => ({
      fileName: file.fileName,
      contentType: file.contentType,
      getContent: () => file.getReadStream({ auth, version: "original" }),
    })),
    ...skill.getCodeDefinedFiles().map((file) => ({
      fileName: file.fileName,
      contentType: file.contentType,
      getContent: () => file.content,
    })),
  ];

  if (files.length === 0) {
    return new Ok({ loadedPaths: [] });
  }

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return fsResult;
  }
  const fileSystem = fsResult.value;

  const expectedPaths = files.map((file) =>
    conversationScopedPath({
      conversationId: conversation.sId,
      rel: `skills/${skill.name}/${file.fileName}`,
    })
  );

  const missing: { file: WritableSkillFile; scopedPath: string }[] = [];

  for (const [index, scopedPath] of expectedPaths.entries()) {
    const existsResult = await fileSystem.exists(scopedPath);
    if (existsResult.isErr()) {
      return new Err(
        new Error(
          `Failed to check skill file: ${scopedPath} (${existsResult.error.message})`
        )
      );
    }

    if (!existsResult.value) {
      missing.push({ file: files[index], scopedPath });
    }
  }

  const writtenPaths: string[] = [];

  for (const { file, scopedPath } of missing) {
    const writeResult = await fileSystem.write(
      scopedPath,
      file.getContent(),
      file.contentType
    );
    if (writeResult.isErr()) {
      for (const writtenPath of writtenPaths) {
        const cleanupResult = await fileSystem.delete(writtenPath, {
          ignoreNotFound: true,
        });
        if (cleanupResult.isErr()) {
          logger.warn(
            {
              scopedPath: writtenPath,
              error: cleanupResult.error.message,
            },
            "Failed to clean up skill file after mount failure."
          );
        }
      }

      return new Err(
        new Error(
          `Failed to write skill file: ${scopedPath} (${writeResult.error.message})`
        )
      );
    }

    writtenPaths.push(scopedPath);
  }

  return new Ok({ loadedPaths: expectedPaths });
}
