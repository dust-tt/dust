import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

export interface GetUserTriggersResponseBody {
  triggers: (TriggerType & {
    isEditor: boolean;
    agentName: string;
    agentPictureUrl: string;
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

  // Get triggers where user is editor or subscriber concurrently
  const [editorTriggers, subscriberTriggers] = await Promise.all([
    TriggerResource.listByUserEditor(auth),
    TriggerResource.listByUserSubscriber(auth),
  ]);

  const editorTriggersWithAgentInfo = await concurrentExecutor(
    editorTriggers,
    async (trigger) => {
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: trigger.agentConfigurationId,
        variant: "light",
      });

      if (!agentConfiguration) {
        return null;
      }

      return {
        ...trigger.toJSON(),
        isEditor: true,
        agentName: agentConfiguration.name,
        agentPictureUrl: agentConfiguration.pictureUrl,
      };
    },
    { concurrency: 5 }
  );

  const subscriberTriggersWithAgentInfo = await concurrentExecutor(
    subscriberTriggers,
    async (trigger) => {
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: trigger.agentConfigurationId,
        variant: "light",
      });

      if (!agentConfiguration) {
        return null;
      }

      return {
        ...trigger.toJSON(),
        isEditor: false,
        agentName: agentConfiguration.name,
        agentPictureUrl: agentConfiguration.pictureUrl,
      };
    },
    { concurrency: 5 }
  );

  // Combine and filter out null values
  const allTriggers = [
    ...editorTriggersWithAgentInfo,
    ...subscriberTriggersWithAgentInfo,
  ];

  const filteredTriggers = allTriggers.filter(
    (trigger): trigger is Exclude<typeof trigger, null> => trigger !== null
  );

  return res.status(200).json({
    triggers: filteredTriggers,
  });
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
