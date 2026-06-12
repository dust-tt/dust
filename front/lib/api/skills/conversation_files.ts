import { SCOPED_PREFIX_CONVERSATION } from "@app/lib/api/file_system/types";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Copy a skill's file attachments into the conversation's GCS file mount under
 * `skills/{skillName}/{fileName}` (skill names are unique per workspace).
 *
 * Writing to the conversation GCS mount (rather than the sandbox filesystem) makes the files
 * visible everywhere the conversation files are: the `files__*` tools, the sandbox gcsfuse mount
 * (`/files/conversation-{cId}/skills/...`), the conversation files panel, and conversation
 * branching copies. The copy is a server-side GCS copy (attachments and conversation files live
 * in the same private bucket) and is idempotent: re-enabling a skill overwrites the same paths.
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

  const owner = auth.getNonNullableWorkspace();
  const basePath = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
  });
  const skillFolder = `skills/${skill.name}`;

  const bucket = getPrivateUploadBucket();
  const loadedPaths: string[] = [];

  for (const file of fileAttachments) {
    const sourcePath = file.getCloudStoragePath(auth, "original");
    const destPath = `${basePath}${skillFolder}/${file.fileName}`;

    try {
      await bucket.copyFile(sourcePath, destPath);
    } catch (err) {
      return new Err(normalizeError(err));
    }

    loadedPaths.push(
      `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/${skillFolder}/${file.fileName}`
    );
  }

  return new Ok({ loadedPaths });
}
