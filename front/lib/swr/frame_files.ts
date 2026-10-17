import {
  isFramePackageRelativePath,
  parseFramePackageRelativePath,
  resolvePackageRelativeToScopedPath,
} from "@app/lib/api/frames/package_file_ref_paths";
import { isAuthorizedFileRef } from "@app/lib/api/viz/authorized_file_access_policy";
import { clientFetch } from "@app/lib/egress/client";
import { isFileId } from "@app/lib/files";
import { getFilePathContentApiPath } from "@app/lib/swr/files";
import datadogLogger from "@app/logger/datadogLogger";
import { GetFrameAuthorizedFilesResponseBodySchema } from "@app/types/api/frame_authorized_files";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type {
  CommandResultMap,
  WriteFileParams,
  WriteFileResult,
} from "@app/types/assistant/visualization";
import type { AuthorizedFileRef } from "@app/types/files";
import {
  DUST_FILE_CAN_WRITE_HEADER,
  DUST_FILE_REVISION_HEADER,
  DUST_IF_REVISION_MATCH_HEADER,
  FileRevisionSchema,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import { useCallback, useRef } from "react";
import { z } from "zod";

// Frame-supplied identifiers are untrusted; keep rejected ones short in log events.
const MAX_LOGGED_FILE_ID_LENGTH = 200;

const FileScopeMetadataSchema = z.object({
  useCaseMetadata: z
    .object({
      conversationId: z.string().optional(),
      spaceId: z.string().optional(),
    })
    .nullish(),
});

interface FrameFilesOptions {
  workspaceId: string;
  conversationId?: string | null;
  spaceId?: string;
  packageRoot?: string | null;
  /** The Frame file whose saved allowlist admits reads outside its own scope. */
  frameFileId?: string | null;
  /** The Frame code the host renders; a change refreshes the allowlist under the same Frame. */
  frameContent?: string | null;
  canWrite: boolean;
}

const resolveFilePath = (filePath: string, packageRoot: string | null) => {
  if (!packageRoot) {
    return null;
  }

  const relativePath = filePath.startsWith(`${packageRoot}/`)
    ? filePath.slice(packageRoot.length + 1)
    : parseFramePackageRelativePath(filePath);

  return relativePath
    ? resolvePackageRelativeToScopedPath({
        relativePath,
        frameRoot: packageRoot,
      })
    : null;
};

interface FrameReadScope {
  conversationId: string | null;
  spaceId?: string;
  packageRoot: string | null;
}

interface FrameReadUrlParams extends FrameReadScope {
  fileId: string;
  workspaceId: string;
  /** Resolves to the Frame's saved allowlist refs, or null when none could be fetched. */
  getAllowlist: () => Promise<AuthorizedFileRef[] | null>;
}

const fetchFrameAllowlist = async (
  workspaceId: string,
  frameFileId: string
): Promise<AuthorizedFileRef[] | null> => {
  let response: Response;
  try {
    response = await clientFetch(
      `/api/w/${workspaceId}/frames/${encodeURIComponent(frameFileId)}/authorized-files`
    );
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  const parsed = GetFrameAuthorizedFilesResponseBodySchema.safeParse(body);
  return parsed.success ? parsed.data.refs : null;
};

type FrameReadRejection = "unresolvable" | "unsafe_path" | "out_of_scope";

// The scoped path a Frame-supplied identifier names, still unvalidated: non-scoped identifiers
// come back verbatim and fail the segment check downstream.
const resolveScopedPath = (
  fileId: string,
  { conversationId, spaceId, packageRoot }: FrameReadScope
): string | null => {
  if (fileId.startsWith("conversation/")) {
    const relativePath = fileId.slice("conversation/".length);
    return conversationId
      ? `conversation-${conversationId}/${relativePath}`
      : null;
  }

  if (fileId.startsWith("pod/") || fileId.startsWith("project/")) {
    const relativePath = fileId.slice(fileId.indexOf("/") + 1);
    return spaceId ? `pod-${spaceId}/${relativePath}` : null;
  }

  if (isFramePackageRelativePath(fileId)) {
    return resolveFilePath(fileId, packageRoot);
  }

  return fileId;
};

const isWithinFrameScope = (
  scopedPath: string,
  { conversationId, spaceId, packageRoot }: FrameReadScope
): boolean => {
  const roots = [
    conversationId && `conversation-${conversationId}`,
    spaceId && `pod-${spaceId}`,
    packageRoot,
  ].filter(isString);
  return roots.some((root) => scopedPath.startsWith(`${root}/`));
};

// A file id carries no context of its own: ask the files API which conversation or Pod the file
// belongs to and require one of them to be the host's.
const isFileWithinFrameScope = async (
  fileId: string,
  workspaceId: string,
  { conversationId, spaceId }: FrameReadScope
): Promise<boolean> => {
  if (!conversationId && !spaceId) {
    return false;
  }

  let response: Response;
  try {
    response = await clientFetch(
      `/api/w/${workspaceId}/files/${fileId}/metadata`
    );
  } catch {
    return false;
  }
  if (!response.ok) {
    return false;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return false;
  }
  const parsed = FileScopeMetadataSchema.safeParse(body);
  if (!parsed.success) {
    return false;
  }

  const metadata = parsed.data.useCaseMetadata;
  return (
    (!!conversationId && metadata?.conversationId === conversationId) ||
    (!!spaceId && metadata?.spaceId === spaceId)
  );
};

/**
 * @cc [owner:smb2268,label:security] frame-read-route-pinning
 * A Frame-supplied identifier MUST NOT change the route of the credentialed read it triggers. Only
 * a complete file sId or a scoped path whose every segment is non-empty and neither `.` nor `..`
 * MAY produce a URL; scoped paths MUST target the files API with every path segment encoded. Any
 * other identifier MUST be rejected before a request is made.
 */
/**
 * @cc [owner:smb2268,label:security] frame-read-scope
 * A read MUST be inside the host-provided Frame context or declared on the Frame's saved
 * allowlist. In context means a scoped path under the Frame's conversation, its Pod, or its
 * package root, or a file sId whose metadata names the Frame's conversation or Pod. The allowlist
 * is matched on the identifier as the Frame wrote it. Anything else MUST be rejected before any
 * content request is made; the files API still applies the viewer's own permissions.
 */
const resolveReadUrl = async ({
  fileId,
  workspaceId,
  getAllowlist,
  ...scope
}: FrameReadUrlParams): Promise<Result<string, FrameReadRejection>> => {
  const isAllowlisted = async () => {
    const refs = await getAllowlist();
    return refs !== null && isAuthorizedFileRef({ refs }, fileId);
  };

  if (isFileId(fileId)) {
    return (await isAllowlisted()) ||
      (await isFileWithinFrameScope(fileId, workspaceId, scope))
      ? new Ok(`/api/w/${workspaceId}/files/${fileId}?action=view`)
      : new Err("out_of_scope");
  }

  const scopedPath = resolveScopedPath(fileId, scope);
  if (!scopedPath) {
    return new Err("unresolvable");
  }
  if (!isSafeFrameRelativePath(scopedPath)) {
    return new Err("unsafe_path");
  }
  if (!isWithinFrameScope(scopedPath, scope) && !(await isAllowlisted())) {
    return new Err("out_of_scope");
  }

  return new Ok(getFilePathContentApiPath({ sId: workspaceId }, scopedPath));
};

/**
 * @cc [owner:flvndvd,label:security;concurrency] frame-file-writes
 * Writes MUST stay within the explicit host-provided packageRoot and require the caller's
 * revision in X-Dust-If-Revision-Match. Read-only hosts MUST reject writes before any request.
 * File permissions MUST remain enforced by the canonical file API.
 */
export const useFrameFiles = ({
  workspaceId,
  conversationId = null,
  spaceId,
  packageRoot = null,
  frameFileId = null,
  frameContent = null,
  canWrite,
}: FrameFilesOptions) => {
  // One allowlist fetch per Frame and content, started on the first out-of-scope read, so the
  // list always matches the code being rendered. A failed fetch is retried on the next read
  // rather than cached as "no allowlist".
  const allowlistRef = useRef<{
    key: string;
    content: string | null;
    promise: Promise<AuthorizedFileRef[] | null>;
  } | null>(null);
  const getAllowlist = useCallback(() => {
    if (!frameFileId) {
      return Promise.resolve(null);
    }
    const key = `${workspaceId}/${frameFileId}`;
    const cached = allowlistRef.current;
    if (cached?.key === key && cached.content === frameContent) {
      return cached.promise;
    }

    const promise = fetchFrameAllowlist(workspaceId, frameFileId).then(
      (allowlist) => {
        if (allowlist === null && allowlistRef.current?.promise === promise) {
          allowlistRef.current = null;
        }
        return allowlist;
      }
    );
    allowlistRef.current = { key, content: frameContent, promise };
    return promise;
  }, [frameContent, frameFileId, workspaceId]);

  const readFile = useCallback(
    async (fileId: string): Promise<CommandResultMap["getFile"]> => {
      const urlRes = await resolveReadUrl({
        fileId,
        workspaceId,
        conversationId,
        spaceId,
        packageRoot,
        getAllowlist,
      });
      if (urlRes.isErr()) {
        datadogLogger.info("Frame file read rejected", {
          reason: urlRes.error,
          fileId: fileId.slice(0, MAX_LOGGED_FILE_ID_LENGTH),
          workspaceId,
          conversationId,
          spaceId,
          packageRoot,
        });
        return { fileBlob: null };
      }

      let response: Response;
      try {
        response = await clientFetch(urlRes.value);
      } catch {
        return { fileBlob: null };
      }

      if (!response.ok) {
        return { fileBlob: null };
      }

      let fileBlob: Blob;
      try {
        fileBlob = await response.blob();
      } catch {
        return { fileBlob: null };
      }

      const parsedRevision = FileRevisionSchema.safeParse(
        response.headers.get(DUST_FILE_REVISION_HEADER)
      );
      const revision = parsedRevision.success ? parsedRevision.data : null;
      return {
        fileBlob,
        revision,
        canWrite:
          canWrite &&
          resolveFilePath(fileId, packageRoot) !== null &&
          revision !== null &&
          response.headers.get(DUST_FILE_CAN_WRITE_HEADER) === "true",
      };
    },
    [canWrite, conversationId, getAllowlist, packageRoot, spaceId, workspaceId]
  );

  const writeFile = useCallback(
    async ({
      path,
      content,
      contentType = "text/plain",
      revision,
    }: WriteFileParams): Promise<WriteFileResult> => {
      if (!canWrite) {
        return {
          success: false,
          error: { code: "read_only", message: "This Frame is read-only." },
        };
      }

      const filePath = resolveFilePath(path, packageRoot);
      if (!filePath) {
        return {
          success: false,
          error: {
            code: "invalid_path",
            message: "Choose a file inside this Frame's folder.",
          },
        };
      }

      let response: Response;
      try {
        response = await clientFetch(
          getFilePathContentApiPath({ sId: workspaceId }, filePath),
          {
            method: "PUT",
            headers: {
              "Content-Type": contentType,
              [DUST_IF_REVISION_MATCH_HEADER]: revision,
            },
            body: content,
          }
        );
      } catch {
        return {
          success: false,
          error: {
            code: "save_failed",
            message:
              "Could not confirm the save. Reload the file before trying again.",
          },
        };
      }

      if (response.status === 412) {
        return {
          success: false,
          error: {
            code: "conflict",
            message:
              "This file changed since it was loaded. Reload it before saving.",
          },
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: { code: "read_only", message: "You cannot edit this file." },
        };
      }

      const savedRevision = FileRevisionSchema.safeParse(
        response.headers.get(DUST_FILE_REVISION_HEADER)
      );
      if (!response.ok || !savedRevision.success) {
        return {
          success: false,
          error: {
            code: "save_failed",
            message:
              "Could not confirm the save. Reload the file before trying again.",
          },
        };
      }

      return { success: true, revision: savedRevision.data };
    },
    [canWrite, packageRoot, workspaceId]
  );

  return { readFile, writeFile };
};
