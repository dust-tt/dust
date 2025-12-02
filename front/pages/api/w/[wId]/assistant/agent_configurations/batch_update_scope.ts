import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getAgentConfiguration,
  updateAgentConfigurationScope,
} from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const BatchUpdateAgentScopeRequestBodySchema = t.type({
  agentIds: t.array(t.string),
  scope: t.union([t.literal("hidden"), t.literal("visible")]),
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

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "You do not have the required permissions.",
      },
    });
  }

  const bodyValidation = BatchUpdateAgentScopeRequestBodySchema.decode(
    req.body
  );
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

  const { agentIds, scope } = bodyValidation.right;

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

      await updateAgentConfigurationScope(auth, agentId, scope);
    },
    { concurrency: 10 }
  );

  return res.status(200).json({
    success: true,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
