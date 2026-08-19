import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
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
 * untouched, and re-enabling a skill only writes whatever is still missing.
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

  const conversationMount = fileSystem
    .getMounts()
    .find((m) => m.kind === "conversation" && m.id === conversation.sId);
  // `forConversation` always creates the conversation mount.
  if (!conversationMount) {
    throw new Error("Conversation mount not found.");
  }

  const expectedPaths = files.map(
    (file) =>
      `${conversationMount.scopedPrefix}/skills/${skill.name}/${file.fileName}`
  );

  const loadedPaths: string[] = [];

  for (const [index, file] of files.entries()) {
    const scopedPath = expectedPaths[index];

    const existsResult = await fileSystem.exists(scopedPath);
    if (existsResult.isErr()) {
      return new Err(
        new Error(
          `Failed to check skill file(s): ${expectedPaths.slice(index).join(", ")} (${existsResult.error.message})`
        )
      );
    }

    if (!existsResult.value) {
      const writeResult = await fileSystem.write(
        scopedPath,
        file.getContent(),
        file.contentType
      );
      if (writeResult.isErr()) {
        return new Err(
          new Error(
            `Failed to write skill file(s): ${expectedPaths.slice(index).join(", ")} (${writeResult.error.message})`
          )
        );
      }
    }

    loadedPaths.push(scopedPath);
  }

  return new Ok({ loadedPaths });
}
