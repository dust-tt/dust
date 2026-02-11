import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TagResource } from "@app/lib/resources/tags_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

const BatchUpdateAgentTagsRequestBodySchema = t.type({
  agentIds: t.array(t.string),
  addTagIds: t.union([t.array(t.string), t.undefined]),
  removeTagIds: t.union([t.array(t.string), t.undefined]),
});

type BatchUpdateAgentTagsResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<BatchUpdateAgentTagsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = BatchUpdateAgentTagsRequestBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.reporter(bodyValidation);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError.join(", ")}`,
      },
    });
  }

  const { agentIds, addTagIds = [], removeTagIds = [] } = bodyValidation.right;

  // Fetch all tags
  const tagsToAdd = await TagResource.fetchByIds(auth, addTagIds);
  const tagsToRemove = await TagResource.fetchByIds(auth, removeTagIds);

  if (
    tagsToAdd.length !== addTagIds.length ||
    tagsToRemove.length !== removeTagIds.length
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "One or more specified tags were not found.",
      },
    });
  }

  // Process agents concurrently
  await concurrentExecutor(
    agentIds,
    async (agentId) => {
      const agent = await getAgentConfiguration(auth, {
        agentId,
        variant: "light",
      });
      if (!agent) {
        return; // Skip if agent not found
      }

      if (!agent.canEdit && !auth.isAdmin()) {
        return; // Skip if user doesn't have permission
      }

      // Add tags
      for (const tag of tagsToAdd) {
        await tag.addToAgent(auth, agent);
      }

      // Remove tags
      for (const tag of tagsToRemove) {
        await tag.removeFromAgent(auth, agent);
      }
    },
    { concurrency: 10 }
  );

  return res.status(200).json({
    success: true,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
