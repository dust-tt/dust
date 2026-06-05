import {
  addContentNodeToProject,
  type GetProjectContextResponseBody,
  listProjectContextAttachments,
  PostProjectContextContentNodeBodySchema,
  type PostProjectContextContentNodeFragment,
  type PostProjectContextContentNodeResponseBody,
} from "@app/lib/api/projects/context";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

import contentNodes from "./content_nodes";
import files from "./files";

/** Lowercase + strip separators so "Hello World 4" matches query "helloworld". */
function normalizeAttachmentSearchKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function attachmentTitleMatchesQuery(title: string, q: string): boolean {
  if (q.length === 0) {
    return true;
  }
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes(q)) {
    return true;
  }
  const normalizedQuery = normalizeAttachmentSearchKey(q);
  if (normalizedQuery.length === 0) {
    return false;
  }
  return normalizeAttachmentSearchKey(title).includes(normalizedQuery);
}

// Mounted under /api/w/:wId/spaces/:spaceId/project_context.
const app = workspaceApp();

app.get(
  "/",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetProjectContextResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const attachments = await listProjectContextAttachments(auth, space);

    const q = ctx.req.query("query")?.trim().toLowerCase() ?? "";

    const filtered = attachments.filter((a) =>
      attachmentTitleMatchesQuery(a.title, q)
    );

    return ctx.json({ attachments: filtered });
  }
);

app.post(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", PostProjectContextContentNodeBodySchema),
  async (ctx): HandlerResult<PostProjectContextContentNodeResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Content node context can only be added to a project space.",
        },
      });
    }

    if (!space.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You do not have write access to this project.",
        },
      });
    }

    const { items } = ctx.req.valid("json");
    const owner = auth.getNonNullableWorkspace();

    const results = await concurrentExecutor(
      items,
      (item) => addContentNodeToProject(auth, { space, contentFragment: item }),
      { concurrency: 2 }
    );

    const contentFragments: PostProjectContextContentNodeFragment[] = [];
    const errors: Array<{ index: number; message: string }> = [];

    results.forEach((result, index) => {
      if (result.isErr()) {
        errors.push({ index, message: result.error.message });
        return;
      }
      const fr = result.value;
      if (
        fr.nodeId == null ||
        fr.nodeDataSourceViewId == null ||
        fr.nodeType == null
      ) {
        errors.push({
          index,
          message: "Missing node fields on content fragment.",
        });
        return;
      }
      contentFragments.push({
        sId: fr.sId,
        title: fr.title,
        contentType: fr.contentType,
        nodeId: fr.nodeId,
        nodeDataSourceViewId: DataSourceViewResource.modelIdToSId({
          id: fr.nodeDataSourceViewId,
          workspaceId: owner.id,
        }),
        nodeType: fr.nodeType,
      });
    });

    return ctx.json({ contentFragments, errors }, 201);
  }
);

app.route("/content_nodes", contentNodes);
app.route("/files", files);

export default app;
