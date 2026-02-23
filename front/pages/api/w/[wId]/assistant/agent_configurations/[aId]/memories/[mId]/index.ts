import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export const PatchAgentMemoryRequestBodySchema = t.type({
  content: t.string,
});

export type PatchAgentMemoryRequestBody = t.TypeOf<
  typeof PatchAgentMemoryRequestBodySchema
>;

export interface PatchAgentMemoryResponseBody {
  memory: {
    sId: string;
    lastUpdated: Date;
    content: string;
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchAgentMemoryResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  const agentConfigurationId = req.query.aId as string;
  const memoryId = req.query.mId as string;

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });
  if (!agentConfiguration || !agentConfiguration.canRead) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  const user = auth.user();
  if (!user) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "user_authentication_required",
        message: "You must be authenticated as a user to access this resource.",
      },
    });
  }

  const memory = await AgentMemoryResource.fetchByIdForUser(auth, {
    memoryId,
    user: user.toJSON(),
  });
  if (!memory) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_memory_not_found",
        message: "The agent memory was not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      const bodyValidation = PatchAgentMemoryRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { content } = bodyValidation.right;

      // Update the memory content
      await memory.updateContent(auth, content);

      return res.status(200).json({
        memory: memory.toJSON(),
      });
    }

    case "DELETE": {
      const result = await memory.delete(auth, {});
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete memory.",
          },
        });
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
