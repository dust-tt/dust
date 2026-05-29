/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  addContentNodeToProject,
  listProjectContextAttachments,
} from "@app/lib/api/projects/context";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { ContentNodeType } from "@app/types/core/content_node";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

/** GET: project context (file-backed + content-node fragments). */
export type GetProjectContextResponseBody = {
  attachments: ConversationAttachmentType[];
};

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

export type PostProjectContextContentNodeFragment = {
  sId: string;
  title: string;
  contentType: string;
  nodeId: string;
  nodeDataSourceViewId: string;
  nodeType: ContentNodeType;
};

export type PostProjectContextContentNodeResponseBody = {
  contentFragments: PostProjectContextContentNodeFragment[];
  errors: Array<{ index: number; message: string }>;
};

const ProjectContextQuerySchema = z.object({
  spaceId: z.string(),
  query: z.string().optional(),
});

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetProjectContextResponseBody | PostProjectContextContentNodeResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const queryValidation = ProjectContextQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid query parameters. Expected `spaceId` (string), optional `query` (string).",
      },
    });
  }

  const { spaceId, query } = queryValidation.data;

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !space.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Space not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const attachments = await listProjectContextAttachments(auth, space);

      const q = query?.trim().toLowerCase() ?? "";

      const filtered = attachments.filter((a) =>
        attachmentTitleMatchesQuery(a.title, q)
      );

      res.status(200).json({ attachments: filtered });
      return;
    }

    case "POST": {
      if (!space.isProject()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Content node context can only be added to a project space.",
          },
        });
      }

      if (!space.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You do not have write access to this project.",
          },
        });
      }

      const bodyValidation = PostProjectContextContentNodeBodySchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        const errorMessage = bodyValidation.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${errorMessage}`,
          },
        });
      }

      const { items } = bodyValidation.data;
      const owner = auth.getNonNullableWorkspace();

      const results = await concurrentExecutor(
        items,
        (item) =>
          addContentNodeToProject(auth, { space, contentFragment: item }),
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

      res.status(201).json({ contentFragments, errors });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
