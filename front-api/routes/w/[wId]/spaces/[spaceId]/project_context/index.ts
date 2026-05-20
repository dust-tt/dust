import {
  addContentNodeToProject,
  listProjectContextAttachments,
} from "@app/lib/api/projects/context";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ContentNodeType } from "@app/types/core/content_node";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import { Hono } from "hono";
import { z } from "zod";

import contentNodes from "./content_nodes";
import files from "./files";

const PostProjectContextContentNodeItemSchema = z.object({
  title: z.string().min(1, "title is required"),
  nodeId: z.string().min(1, "nodeId is required"),
  nodeDataSourceViewId: z.string().min(1, "nodeDataSourceViewId is required"),
  url: z.string().nullable().optional(),
  supersededContentFragmentId: z.string().nullable().optional(),
});

const PostProjectContextContentNodeBodySchema = z.object({
  items: z.array(PostProjectContextContentNodeItemSchema),
});

type PostProjectContextContentNodeFragment = {
  sId: string;
  title: string;
  contentType: string;
  nodeId: string;
  nodeDataSourceViewId: string;
  nodeType: ContentNodeType;
};

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
const app = new Hono();

app.get("/", withSpace({ requireCanRead: true }), async (ctx) => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");

  const attachments = await listProjectContextAttachments(auth, space);

  const q = ctx.req.query("query")?.trim().toLowerCase() ?? "";

  const filtered = attachments.filter((a) =>
    attachmentTitleMatchesQuery(a.title, q)
  );

  return ctx.json({ attachments: filtered });
});

app.post(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", PostProjectContextContentNodeBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const featureFlags = await getFeatureFlags(auth);
    if (!featureFlags.includes("projects")) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "Projects feature is not enabled for this workspace.",
        },
      });
    }

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
