import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  type GCSMountEntry,
  type GCSMountPoint,
  getGCSPathFromScopedPath,
  listGCSMountFiles,
} from "@app/lib/api/files/gcs_mount/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
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
  conversation: ConversationWithoutContentType
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

async function buildPodMountPoint(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  { access }: { access: Access }
): Promise<Result<MountPoint, MCPError>> {
  if (!isProjectConversation(conversation)) {
    return new Err(
      new MCPError("Pod file paths are only available in Pod conversations.", {
        tracked: false,
      })
    );
  }

  const space = await SpaceResource.fetchById(auth, conversation.spaceId);
  if (!space) {
    return new Err(
      new MCPError("Pod not found for this conversation.", {
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
          ? "You do not have write permissions for this Pod."
          : "You do not have read permissions for this Pod.",
        { tracked: false }
      )
    );
  }

  const owner = auth.getNonNullableWorkspace();
  return new Ok({
    scope: { useCase: "pod", podId: space.sId },
    prefix: getPodFilesBasePath({
      workspaceId: owner.sId,
      podId: space.sId,
    }),
  });
}

/**
 * Resolve the mount point a scoped path belongs to. Dispatches by the path's `conversation/` or
 * `pod/` prefix, looks up the parent Pod space when needed, and verifies the requested
 * access level.
 */
export async function resolveMountPoint(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  { access, scopedPath }: { access: Access; scopedPath: string }
): Promise<Result<MountPoint, MCPError>> {
  const parsed = parseScopedFilePath(scopedPath);
  if (!parsed) {
    return new Err(
      new MCPError(
        `Invalid path: \`${scopedPath}\` must start with \`conversation/\` or \`pod/\`.`,
        { tracked: false }
      )
    );
  }

  return resolveMountByUseCase(auth, conversation, {
    useCase: parsed.prefix,
    access,
  });
}

/**
 * Resolve the mount point for a given scope use case, without going through a path. Used by tools
 * that operate on a whole mount (e.g. `list`).
 */
export async function resolveMountByUseCase(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  { useCase, access }: { useCase: GCSMountPoint["useCase"]; access: Access }
): Promise<Result<MountPoint, MCPError>> {
  switch (useCase) {
    case "conversation":
      return new Ok(buildConversationMountPoint(auth, conversation));

    case "pod":
      return buildPodMountPoint(auth, conversation, { access });

    default:
      assertNever(useCase);
  }
}

/**
 * List the files mounted under a Pod's GCS prefix. Verifies `space.canRead(auth)` before
 * touching the bucket. Use this from callers that already hold a `SpaceResource` so the
 * file-listing path stays funneled through the same helper as `files__list`.
 */
export async function listProjectFiles(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<GCSMountEntry[], MCPError>> {
  if (!space.isProject) {
    return new Err(new MCPError("Space is not a Pod.", { tracked: false }));
  }

  if (!space.canRead(auth)) {
    return new Err(
      new MCPError("You do not have read permissions for this Pod.", {
        tracked: false,
      })
    );
  }

  const entries = await listGCSMountFiles(auth, {
    useCase: "pod",
    podId: space.sId,
  });

  return new Ok(entries);
}

/**
 * Resolve a GCS file from a scoped path. Looks up the file metadata via `resolveMountPoint`.
 * Used by `cat` and `grep`.
 */
export async function resolveFile(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  path: string
): Promise<Result<ResolvedFile, MCPError>> {
  const mountRes = await resolveMountPoint(auth, conversation, {
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

  // GCS object names are byte-exact. Pre-NFC-normalization rollout, some objects were stored in
  // NFD (e.g. macOS uploads) while LLMs typically echo paths back as NFC, causing 404s on visually
  // identical paths. Try the path as-is first, then NFC, then NFD.
  // TODO(2026-05-11 FILE SYSTEM): Remove the NFC/NFD fallbacks once legacy non-NFC objects have
  // been re-keyed or aged out. Uploads are now normalized to NFC at FileResource.makeNew.
  const nfc = gcsPath.normalize("NFC");
  const nfd = gcsPath.normalize("NFD");
  const candidates = [gcsPath];

  if (nfc !== gcsPath) {
    candidates.push(nfc);
  }

  if (nfd !== gcsPath && nfd !== nfc) {
    candidates.push(nfd);
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    const file = bucket.file(candidate);

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
      lastError = err;
    }
  }

  return new Err(
    new MCPError(
      `File not found: \`${path}\`. Error: ${normalizeError(lastError).message}`,
      { tracked: false }
    )
  );
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
