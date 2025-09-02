import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

export interface GetUserTriggersResponseBody {
  triggers: (TriggerType & {
    isSubscriber: boolean;
    isEditor: boolean;
    agentName: string;
  })[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetUserTriggersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  // Get triggers where the user is either editor or subscriber
  const userTriggers = await TriggerResource.listByUser(auth);

  // Get agent configurations and build response
  const triggersWithAgentNames = await Promise.all(
    userTriggers.map(async (trigger) => {
      const isEditor = trigger.editor === auth.getNonNullableUser().id;
      const isSubscriber = await trigger.isSubscriber(auth);

      // Get agent configuration to get the agent name
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: trigger.agentConfigurationId,
        variant: "light",
      });

      if (!agentConfiguration) {
        return null;
      }

      return {
        ...trigger.toJSON(),
        isSubscriber,
        isEditor,
        agentName: agentConfiguration.name,
      };
    })
  );

  // Filter out null values (in case some agent configurations were not found)
  const filteredTriggers = triggersWithAgentNames.filter(
    (trigger): trigger is NonNullable<typeof trigger> => trigger !== null
  );

  return res.status(200).json({
    triggers: filteredTriggers,
  });
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
