// @migration-status: MIGRATED_TO_HONO

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
/** @ignoreswagger */
import type {
  CreateTagResponseBody,
  GetTagsResponseBody,
} from "@app/lib/api/tags";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { TagResource } from "@app/lib/resources/tags_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const PostBodySchema = z.object({
  name: z.string(),
  agentIds: z.array(z.string()).optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetTagsResponseBody | CreateTagResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const tags = await TagResource.findAll(auth);

      return res.status(200).json({
        tags: tags.map((tag) => tag.toJSON()),
      });
    }
    case "POST": {
      const r = PostBodySchema.safeParse(req.body);

      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "invalid_request_error",
            message: "Only workspace administrators can create tags",
          },
        });
      }

      if (!r.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }

      const body = r.data;
      const { name, agentIds } = body;

      const existingTag = await TagResource.findByName(auth, name);

      if (existingTag) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "A tag with this name already exists",
          },
        });
      }

      const newTag = await TagResource.makeNew(auth, {
        name,
        kind: "standard",
      });

      if (agentIds) {
        const agentsToTag = await AgentConfigurationModel.findAll({
          where: {
            sId: agentIds,
            workspaceId: auth.getNonNullableWorkspace().id,
            status: "active",
          },
        });

        for (const agent of agentsToTag) {
          await TagAgentModel.create({
            workspaceId: auth.getNonNullableWorkspace().id,
            tagId: newTag.id,
            agentConfigurationId: agent.id,
          });
        }
      }

      return res.status(201).json({
        tag: newTag.toJSON(),
      });
    }
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
