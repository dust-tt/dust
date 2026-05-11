import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  type GCSMountPoint,
  getGCSPathFromScopedPath,
} from "@app/lib/api/files/gcs_mount/files";
import {
  getConversationFilesBasePath,
  getProjectFilesBasePath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ConversationType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import { stripMimeParameters } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { File as GCSFile } from "@google-cloud/storage";

interface ResolvedFile {
  file: GCSFile;
  mimeType: string;
  sizeBytes: number;
}

export interface MountPoint {
  prefix: string;
  scope: GCSMountPoint;
}

type Access = "read" | "write";

function buildConversationMountPoint(
  auth: Authenticator,
  conversation: ConversationType
): MountPoint {
  const owner = auth.getNonNullableWorkspace();
  return {
    scope: { useCase: "conversation", conversationId: conversation.sId },
    prefix: getConversationFilesBasePath({
      workspaceId: owner.sId,
      conversationId: conversation.sId,
    }),
  };
}

async function buildProjectMountPoint(
  auth: Authenticator,
  conversation: ConversationType,
  { access }: { access: Access }
): Promise<Result<MountPoint, MCPError>> {
  if (!isProjectConversation(conversation)) {
    return new Err(
      new MCPError(
        "Project file paths are only available in project conversations.",
        { tracked: false }
      )
    );
  }

  const space = await SpaceResource.fetchById(auth, conversation.spaceId);
  if (!space) {
    return new Err(
      new MCPError("Project not found for this conversation.", {
        tracked: false,
      })
    );
  }

  const allowed =
    access === "write" ? space.canWrite(auth) : space.canRead(auth);
  if (!allowed) {
    return new Err(
      new MCPError(
        access === "write"
          ? "You do not have write permissions for this project."
          : "You do not have read permissions for this project.",
        { tracked: false }
      )
    );
  }

  const owner = auth.getNonNullableWorkspace();
  return new Ok({
    scope: { useCase: "project", projectId: space.sId },
    prefix: getProjectFilesBasePath({
      workspaceId: owner.sId,
      projectId: space.sId,
    }),
  });
}

/**
 * Resolve the mount point a scoped path belongs to. Dispatches by the path's `conversation/` or
 * `project/` prefix, looks up the parent project space when needed, and verifies the requested
 * access level.
 */
export async function resolveMountPointForPath(
  auth: Authenticator,
  conversation: ConversationType,
  { access, scopedPath }: { access: Access; scopedPath: string }
): Promise<Result<MountPoint, MCPError>> {
  const parsed = parseScopedFilePath(scopedPath);
  if (!parsed) {
    return new Err(
      new MCPError(
        `Invalid path: \`${scopedPath}\` must start with \`conversation/\` or \`project/\`.`,
        { tracked: false }
      )
    );
  }

  switch (parsed.prefix) {
    case "conversation":
      return new Ok(buildConversationMountPoint(auth, conversation));

    case "project":
      return buildProjectMountPoint(auth, conversation, { access });

    default:
      assertNever(parsed.prefix);
  }
}

/**
 * Resolve all mount points visible from the given conversation: the conversation's own mount, plus
 * the parent project mount when the conversation is in a project (and the actor can read it).
 * Used by the `list` tool to enumerate everything available.
 */
export async function resolveAvailableMountPoints(
  auth: Authenticator,
  conversation: ConversationType
): Promise<MountPoint[]> {
  const mounts: MountPoint[] = [
    buildConversationMountPoint(auth, conversation),
  ];

  if (isProjectConversation(conversation)) {
    const projectRes = await buildProjectMountPoint(auth, conversation, {
      access: "read",
    });
    // Silently skip the project mount if the actor lacks read permissions — listing should still
    // surface conversation files. Other errors (e.g. space not found) also drop the mount.
    if (projectRes.isOk()) {
      mounts.push(projectRes.value);
    }
  }

  return mounts;
}

/**
 * Resolve a GCS file from a scoped path for read access. Used by `cat` and `grep`.
 */
export async function resolveFileForRead(
  auth: Authenticator,
  conversation: ConversationType,
  path: string
): Promise<Result<ResolvedFile, MCPError>> {
  const mountRes = await resolveMountPointForPath(auth, conversation, {
    access: "read",
    scopedPath: path,
  });
  if (mountRes.isErr()) {
    return mountRes;
  }

  const { scope, prefix } = mountRes.value;
  const gcsPath = getGCSPathFromScopedPath({
    prefix,
    scopedPath: path,
    useCase: scope.useCase,
  });
  if (!gcsPath) {
    return new Err(
      new MCPError(
        `Invalid path: \`${path}\` does not match the resolved mount point.`,
        { tracked: false }
      )
    );
  }

  const bucket = getPrivateUploadBucket();
  const file = bucket.file(gcsPath);

  try {
    const [metadata] = await file.getMetadata();
    const rawContentType = isString(metadata.contentType)
      ? metadata.contentType
      : "application/octet-stream";
    return new Ok({
      file,
      mimeType: stripMimeParameters(rawContentType),
      sizeBytes: Number(metadata.size ?? 0),
    });
  } catch (err) {
    return new Err(
      new MCPError(
        `File not found: \`${path}\`. Error: ${normalizeError(err).message}`,
        { tracked: false }
      )
    );
  }
}

// TODO(20260429 FILE SYSTEM): Find a more exhaustive approach to cover more files.
export function isReadableAsText(contentType: string): boolean {
  const mime = stripMimeParameters(contentType);
  return (
    mime.startsWith("text/") ||
    [
      "application/json",
      "application/yaml",
      "application/xml",
      "application/x-ndjson",
      "application/javascript",
      "application/typescript",
    ].includes(mime)
  );
}
