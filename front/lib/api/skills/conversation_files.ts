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
type WritableSkillFile = {
  fileName: string;
  contentType: string;
  content: Readable | string;
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
  const files: WritableSkillFile[] = [
    ...skill.getFileAttachments().map((file) => ({
      fileName: file.fileName,
      contentType: file.contentType,
      content: file.getReadStream({ auth, version: "original" }),
    })),
    ...skill.getCodeDefinedFiles().map((file) => ({
      fileName: file.fileName,
      contentType: file.contentType,
      content: file.content,
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

    const writeResult = await fileSystem.write(
      scopedPath,
      file.content,
      file.contentType
    );
    if (writeResult.isErr()) {
      const missingPaths = expectedPaths.slice(index);
      return new Err(
        new Error(
          `Failed to write skill file(s): ${missingPaths.join(", ")} (${writeResult.error.message})`
        )
      );
    }

    loadedPaths.push(scopedPath);
  }

  return new Ok({ loadedPaths });
}
