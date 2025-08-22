import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type {
  TriggerConfiguration,
  TriggerType,
} from "@app/types/assistant/triggers";
import { TriggerSchema } from "@app/types/assistant/triggers";

export interface GetTriggersResponseBody {
  triggers: TriggerType[];
}

export interface PatchTriggersRequestBody {
  triggers: Array<
    {
      sId?: string;
      name: string;
    } & TriggerConfiguration
  >;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTriggersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const agentConfigurationId = req.query.aId;

  if (typeof agentConfigurationId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent configuration ID.",
      },
    });
  }

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

  const triggers = await TriggerResource.listByAgentConfigurationId(
    auth,
    agentConfigurationId
  );

  switch (req.method) {
    case "GET": {
      return res.status(200).json({
        triggers: triggers.map((trigger) => trigger.toJSON()),
      });
    }

    case "PATCH": {
      if (!agentConfiguration.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can update triggers for this agent.",
          },
        });
      }

      if (
        !req.body ||
        !req.body.triggers ||
        !Array.isArray(req.body.triggers)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Request body must contain a 'triggers' array.",
          },
        });
      }

      const { triggers: requestTriggers } = req.body;
      const workspace = auth.getNonNullableWorkspace();

      const currentTriggersMap = new Map(triggers.map((t) => [t.sId, t]));
      const resultTriggers: TriggerType[] = [];
      const errors: Error[] = [];

      for (const triggerData of requestTriggers) {
        const triggerValidation = TriggerSchema.decode(triggerData);

        if (isLeft(triggerValidation)) {
          const pathError = reporter.formatValidationErrors(
            triggerValidation.left
          );
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid trigger data: ${pathError}`,
            },
          });
        }

        const validatedTrigger = triggerValidation.right;

        if (triggerData.sId && currentTriggersMap.has(triggerData.sId)) {
          const existingTrigger = currentTriggersMap.get(triggerData.sId)!;
          const updatedTrigger = await TriggerResource.update(
            auth,
            existingTrigger.sId,
            validatedTrigger
          );
          if (updatedTrigger.isErr()) {
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to update trigger.",
              },
            });
          }

          resultTriggers.push(updatedTrigger.value.toJSON());
          currentTriggersMap.delete(triggerData.sId);
        } else {
          const sId = generateRandomModelSId();
          const newTrigger = await TriggerResource.makeNew(auth, {
            sId,
            workspaceId: workspace.id,
            agentConfigurationId,
            name: validatedTrigger.name,
            kind: validatedTrigger.kind,
            configuration: validatedTrigger.configuration,
            editor: auth.getNonNullableUser().id,
          });

          if (newTrigger.isErr()) {
            errors.push(newTrigger.error);
            continue;
          }

          resultTriggers.push(newTrigger.value.toJSON());
        }
      }

      for (const [, trigger] of currentTriggersMap) {
        await trigger.delete(auth);
      }

      if (errors.length > 0) {
        logger.error(
          {
            errors: errors.map((e) => e.message),
            workspaceId: workspace.id,
            agentConfigurationId: agentConfiguration.id,
          },
          `Failed to process ${errors.length} triggers.`
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to process ${errors.length} triggers`,
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
            "The method passed is not supported, GET, POST or PATCH is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
