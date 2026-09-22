import {
  parseFramePackageRelativePath,
  resolvePackageRelativeToScopedPath,
} from "@app/lib/api/frames/package_file_ref_paths";
import { clientFetch } from "@app/lib/egress/client";
import { saveDocumentSnapshot } from "@app/lib/swr/documents";
import { getFilePathContentApiPath } from "@app/lib/swr/files";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type {
  FrameDocumentFiles,
  FrameDocumentResult,
  FrameDocumentSnapshot,
} from "@app/types/assistant/visualization";
import { NativeDocumentSchema } from "@app/types/documents";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

const SnapshotSchema = z.object({
  document: NativeDocumentSchema,
  revision: z.string().regex(/^[0-9]+$/),
  canEdit: z.boolean(),
});

const resolveDocumentPath = (
  src: string,
  frameRoot: string | null,
  isPublic: boolean
): string | null => {
  if (isPublic || !frameRoot || !src.toLowerCase().endsWith(".dustdoc")) {
    return null;
  }
  const relativePath = parseFramePackageRelativePath(src);
  return relativePath
    ? resolvePackageRelativeToScopedPath({ relativePath, frameRoot })
    : null;
};

/**
 * @cc [owner:flvndvd,label:security] frame-document-file-access
 * Shared Frames MUST NOT read or write documents through private credentials.
 * Document RPC MUST be restricted to native document files inside the host's Frame package.
 * The package root MUST come from Frame permissions without inferring it from a file extension.
 * The Files API MUST enforce mount permissions and the expected revision on every save.
 */
export const createFrameDocumentFiles = ({
  workspaceId,
  packageRoot,
  isPublic,
}: {
  workspaceId: string;
  packageRoot: string | null | undefined;
  isPublic: boolean;
}): FrameDocumentFiles => {
  const owner = { sId: workspaceId };
  const frameRoot = packageRoot ?? null;
  return {
    load: async (src): Promise<FrameDocumentResult<FrameDocumentSnapshot>> => {
      const path = resolveDocumentPath(src, frameRoot, isPublic);
      if (!path) {
        return {
          ok: false,
          error: "This document is unavailable in this Frame.",
        };
      }
      let response: Response;
      try {
        response = await clientFetch(
          `${getFilePathContentApiPath(owner, path)}?document=1`
        );
      } catch (error) {
        return { ok: false, error: normalizeError(error).message };
      }
      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        return { ok: false, error: error.message };
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { ok: false, error: "The document could not be loaded." };
      }
      const parsed = SnapshotSchema.safeParse(body);
      if (!parsed.success) {
        return { ok: false, error: "The document response is invalid." };
      }
      const snapshot = parsed.data;
      return {
        ok: true,
        value: {
          source: JSON.stringify(snapshot.document),
          revision: snapshot.revision,
          canEdit: snapshot.canEdit,
        },
      };
    },
    save: async ({ src, source, revision }) => {
      const path = resolveDocumentPath(src, frameRoot, isPublic);
      if (!path) {
        return { ok: false, error: "Editing is unavailable in this Frame." };
      }
      let result;
      try {
        result = await saveDocumentSnapshot({
          owner,
          canonicalPath: path,
          source,
          revision,
        });
      } catch (error) {
        return { ok: false, error: normalizeError(error).message };
      }
      return result.isOk()
        ? { ok: true, value: result.value }
        : { ok: false, error: result.error.message };
    },
  };
};
