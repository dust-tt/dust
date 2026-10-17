import { canAccessFrame } from "@app/lib/api/files/frame_access";
import {
  fetchShareableFileAllowlistState,
  readFrameFileContent,
} from "@app/lib/api/viz/authorized_file_access";
import { isAllowlistStale } from "@app/lib/api/viz/authorized_file_access_policy";
import { FileResource } from "@app/lib/resources/file_resource";
import type { GetFrameAuthorizedFilesResponseBody } from "@app/types/api/frame_authorized_files";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string(),
});

// Mounted at /api/w/:wId/frames/:frameId/authorized-files.
const app = workspaceApp();

/**
 * @cc [owner:smb2268,label:security] frame-authorized-files-current
 * The refs returned MUST be the allowlist persisted for the Frame's current content. When no
 * allowlist exists or its content hash no longer matches the Frame, the response MUST be empty
 * rather than the stale list.
 */
/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { frameId } = ctx.req.valid("param");

  const frame = await FileResource.fetchById(auth, frameId);
  if (!frame?.isShareableFrame || !(await canAccessFrame(auth, frame))) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "Frame not found." },
    });
  }

  const empty: GetFrameAuthorizedFilesResponseBody = { refs: [] };

  const state = await fetchShareableFileAllowlistState(frame);
  const allowlist = state?.allowlist ?? null;
  if (!allowlist || allowlist.refs.length === 0) {
    return ctx.json(empty);
  }

  const frameContent = await readFrameFileContent(auth, frame);
  if (frameContent === null || isAllowlistStale(allowlist, frameContent)) {
    return ctx.json(empty);
  }

  return ctx.json<GetFrameAuthorizedFilesResponseBody>({
    refs: allowlist.refs,
  });
});

export default app;
