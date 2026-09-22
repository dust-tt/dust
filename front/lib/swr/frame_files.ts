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
  framePath?: string | null;
  packageRoot?: string | null;
  canWrite: boolean;
}

// Older hosts provide either the entry file or its directory for package reads.
const resolveLegacyPackageRoot = (framePath: string | null) => {
  if (!framePath) {
    return null;
  }

  const normalized = framePath.replace(/\/+$/, "");
  if (!normalized.includes("/")) {
    return null;
  }

  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  const looksLikeEntryFile =
    base === "manifest.json" || /\.[A-Za-z0-9]+$/.test(base);

  return looksLikeEntryFile
    ? normalized.slice(0, normalized.lastIndexOf("/")) || null
    : normalized;
};

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

/**
 * @cc [owner:flvndvd,label:security;concurrency] frame-file-writes
 * Writes MUST stay within the host-provided Frame package and require the caller's
 * revision in If-Match. Read-only hosts MUST reject writes before any request.
 * File permissions MUST remain enforced by the canonical file API.
 */
export const useFrameFiles = ({
  workspaceId,
  conversationId = null,
  spaceId,
  framePath = null,
  packageRoot = null,
  canWrite,
}: FrameFilesOptions) => {
  const readPackageRoot = packageRoot ?? resolveLegacyPackageRoot(framePath);

  const readFile = useCallback(
    async (fileId: string): Promise<CommandResultMap["getFile"]> => {
      let url: string;

      if (fileId.startsWith("conversation-") || fileId.startsWith("pod-")) {
        url = getFilePathContentApiPath({ sId: workspaceId }, fileId);
      } else if (fileId.startsWith("conversation/")) {
        if (!conversationId) {
          return { fileBlob: null };
        }

        const relativePath = fileId.slice("conversation/".length);
        url = `/api/w/${workspaceId}/files/path/conversation-${conversationId}/${relativePath}`;
      } else if (fileId.startsWith("pod/") || fileId.startsWith("project/")) {
        if (!spaceId) {
          return { fileBlob: null };
        }

        const relativePath = fileId.startsWith("pod/")
          ? fileId.slice("pod/".length)
          : fileId.slice("project/".length);
        url = `/api/w/${workspaceId}/files/path/pod-${spaceId}/${relativePath}`;
      } else if (isFramePackageRelativePath(fileId)) {
        const filePath = resolveFilePath(fileId, readPackageRoot);
        if (!filePath) {
          return { fileBlob: null };
        }

        url = getFilePathContentApiPath({ sId: workspaceId }, filePath);
      } else {
        url = `/api/w/${workspaceId}/files/${fileId}?action=view`;
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
    [
      canWrite,
      conversationId,
      packageRoot,
      readPackageRoot,
      spaceId,
      workspaceId,
    ]
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
