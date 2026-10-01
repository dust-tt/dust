import {
  parseScopedPrefix,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";

export type AuthorizedMountPath =
  | { status: "ok"; path: string }
  | { status: "denied" }
  | { status: "unmounted" };

/**
 * @cc [owner:frankaloia,label:security] mount-path-withheld-until-authorized
 * The function MUST return `ok` only when `canReadSourceFile` grants the file and the caller
 * can access the conversation or pod encoded in its mount path. `denied` and `unmounted` MUST
 * NOT include a path, file name, conversation id, or pod id.
 */
export async function readAuthorizedMountPath(
  auth: Authenticator,
  file: FileResource
): Promise<AuthorizedMountPath> {
  if (!(await canReadSourceFile(auth, file))) {
    return { status: "denied" };
  }

  const workspace = auth.workspace();
  if (!workspace) {
    return { status: "denied" };
  }

  const mountFilePath = file.mountFilePath;
  if (!mountFilePath) {
    return { status: "unmounted" };
  }

  const canonicalPath = gcsPathToCanonical(workspace, mountFilePath);
  if (!canonicalPath) {
    return { status: "unmounted" };
  }

  if (!(await canReadMountedCanonicalPath(auth, canonicalPath))) {
    return { status: "denied" };
  }

  return { status: "ok", path: canonicalPath };
}

/**
 * @cc [owner:frankaloia,label:security] source-file-read-deny-by-default
 * A caller MUST be denied unless one rule below grants read access.
 * A system key MUST be granted for every use case: system-key uploads (connector table syncs)
 * carry no user and no space, and system keys already hold wildcard grants.
 * `conversation` and `tool_output` MUST be granted only when
 * `useCaseMetadata.conversationId` is set and `ConversationResource.fetchById` returns that
 * conversation, or when the id is absent and `file.userId` is the caller's user id.
 * `folders_document` and `project_context` MUST be granted only when `useCaseMetadata.spaceId`
 * is set and the caller can read that space.
 * `upsert_table` MUST be granted only when the caller can read `useCaseMetadata.spaceId`, or
 * when that id is absent and the caller is `file.userId`.
 * `upsert_document` and `avatar` MUST be granted only to `file.userId`.
 * `workspace_branding` MUST be granted only to `file.userId` or a workspace admin.
 * `skill_attachment` MUST be granted only when the caller can read a skill that references the
 * file or `useCaseMetadata.skillId`, or when neither binding exists and the caller is
 * `file.userId`.
 * Any other use case, a missing owner, or a failed lookup MUST be a denial.
 */
export async function canReadSourceFile(
  auth: Authenticator,
  file: FileResource
): Promise<boolean> {
  if (auth.isSystemKey()) {
    return true;
  }

  switch (file.useCase) {
    case "conversation":
    case "tool_output": {
      const conversationId = file.useCaseMetadata?.conversationId;
      if (!conversationId) {
        return isFileOwner(auth, file);
      }
      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      return conversation !== null;
    }
    case "folders_document":
    case "project_context":
      return canReadSpace(auth, file.useCaseMetadata?.spaceId);
    case "upsert_table": {
      const spaceId = file.useCaseMetadata?.spaceId;
      if (!spaceId) {
        return isFileOwner(auth, file);
      }
      return canReadSpace(auth, spaceId);
    }
    case "upsert_document":
    case "avatar":
      return isFileOwner(auth, file);
    case "workspace_branding":
      return isFileOwner(auth, file) || auth.isAdmin();
    case "skill_attachment":
      return canReadSkillAttachment(auth, file);
    default:
      return assertNever(file.useCase);
  }
}

function isFileOwner(auth: Authenticator, file: FileResource): boolean {
  const user = auth.user();
  return user !== null && file.userId === user.id;
}

async function canReadSpace(
  auth: Authenticator,
  spaceId: string | undefined
): Promise<boolean> {
  if (!spaceId) {
    return false;
  }
  const space = await SpaceResource.fetchById(auth, spaceId);
  return space !== null && auth.can("read", space);
}

async function canReadSkillAttachment(
  auth: Authenticator,
  file: FileResource
): Promise<boolean> {
  const { isReferenced, skills } = await SkillResource.fetchFileSkills(
    auth,
    file
  );
  if (isReferenced) {
    return skills.length > 0;
  }

  const skillId = file.useCaseMetadata?.skillId;
  if (!skillId) {
    return isFileOwner(auth, file);
  }

  const skill = await SkillResource.fetchById(auth, skillId);
  return skill !== null;
}

async function canReadMountedCanonicalPath(
  auth: Authenticator,
  canonicalPath: string
): Promise<boolean> {
  const parsed = parseScopedPrefix(canonicalPath);
  if (!parsed) {
    return false;
  }

  switch (parsed.kind) {
    case "conversation": {
      const conversation = await ConversationResource.fetchById(
        auth,
        parsed.id
      );
      return conversation !== null;
    }
    case "pod": {
      const space = await SpaceResource.fetchById(auth, parsed.id);
      return space !== null && space.isProject() && auth.can("read", space);
    }
    case "user":
      return false;
    default:
      return assertNever(parsed);
  }
}

function gcsPathToCanonical(
  workspace: LightWorkspaceType,
  mountFilePath: string
): string | null {
  const base = `w/${workspace.sId}/`;
  if (!mountFilePath.startsWith(base)) {
    return null;
  }

  const rest = mountFilePath.slice(base.length);

  const conv = rest.match(/^conversations\/([^/]+)\/files\/(.+)$/);
  if (conv) {
    return `${SCOPED_PREFIX_CONVERSATION}${conv[1]}/${conv[2]}`;
  }

  const pod =
    rest.match(/^pods\/([^/]+)\/files\/(.+)$/) ??
    rest.match(/^projects\/([^/]+)\/files\/(.+)$/);
  if (pod) {
    return `${SCOPED_PREFIX_POD}${pod[1]}/${pod[2]}`;
  }

  return null;
}
