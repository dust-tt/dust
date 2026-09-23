import {
  isFramePackageRelativePath,
  parseFramePackageRelativePath,
  resolvePackageRelativeToScopedPath,
} from "@app/lib/api/frames/package_file_ref_paths";
import { clientFetch } from "@app/lib/egress/client";
import { getFilePathContentApiPath } from "@app/lib/swr/files";
import type {
  CommandResultMap,
  WriteFileParams,
  WriteFileResult,
} from "@app/types/assistant/visualization";
import { DUST_FILE_CAN_WRITE_HEADER } from "@app/types/files";
import { useCallback } from "react";

interface FrameFilesOptions {
  workspaceId: string;
  conversationId?: string | null;
  spaceId?: string;
  packageRoot?: string | null;
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

interface FrameReadUrlParams {
  fileId: string;
  workspaceId: string;
  conversationId: string | null;
  spaceId?: string;
  packageRoot: string | null;
}

const resolveReadUrl = ({
  fileId,
  workspaceId,
  conversationId,
  spaceId,
  packageRoot,
}: FrameReadUrlParams): string | null => {
  if (fileId.startsWith("conversation-") || fileId.startsWith("pod-")) {
    return getFilePathContentApiPath({ sId: workspaceId }, fileId);
  }

  if (fileId.startsWith("conversation/")) {
    const relativePath = fileId.slice("conversation/".length);
    return conversationId
      ? `/api/w/${workspaceId}/files/path/conversation-${conversationId}/${relativePath}`
      : null;
  }

  if (fileId.startsWith("pod/") || fileId.startsWith("project/")) {
    const relativePath = fileId.slice(fileId.indexOf("/") + 1);
    return spaceId
      ? `/api/w/${workspaceId}/files/path/pod-${spaceId}/${relativePath}`
      : null;
  }

  if (isFramePackageRelativePath(fileId)) {
    const filePath = resolveFilePath(fileId, packageRoot);
    return filePath
      ? getFilePathContentApiPath({ sId: workspaceId }, filePath)
      : null;
  }

  return `/api/w/${workspaceId}/files/${fileId}?action=view`;
};

/**
 * @cc [owner:flvndvd,label:security;concurrency] frame-file-writes
 * Writes MUST stay within the explicit host-provided packageRoot and require the caller's
 * revision in If-Match. Read-only hosts MUST reject writes before any request.
 * File permissions MUST remain enforced by the canonical file API.
 */
export const useFrameFiles = ({
  workspaceId,
  conversationId = null,
  spaceId,
  packageRoot = null,
  canWrite,
}: FrameFilesOptions) => {
  const readFile = useCallback(
    async (fileId: string): Promise<CommandResultMap["getFile"]> => {
      const url = resolveReadUrl({
        fileId,
        workspaceId,
        conversationId,
        spaceId,
        packageRoot,
      });
      if (!url) {
        return { fileBlob: null };
      }

      let response: Response;
      try {
        response = await clientFetch(url);
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

      const revision = response.headers.get("ETag");
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
    [canWrite, conversationId, packageRoot, spaceId, workspaceId]
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
            headers: { "Content-Type": contentType, "If-Match": revision },
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

      const savedRevision = response.headers.get("ETag");
      if (!response.ok || !savedRevision) {
        return {
          success: false,
          error: {
            code: "save_failed",
            message:
              "Could not confirm the save. Reload the file before trying again.",
          },
        };
      }

      return { success: true, revision: savedRevision };
    },
    [canWrite, packageRoot, workspaceId]
  );

  return { readFile, writeFile };
};
