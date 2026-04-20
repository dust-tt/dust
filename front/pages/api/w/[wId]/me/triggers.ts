/** @ignoreswagger */
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { WithAPIErrorResponse } from "@app/types/error";
import { removeNulls } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

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

  const editorTriggers = await TriggerResource.listByUserEditor(
    auth,
    auth.getNonNullableUser()
  );

  const uniqueAgentIds = Array.from(
    new Set(editorTriggers.map((t) => t.agentConfigurationId))
  );

  const agentConfigurations = await getAgentConfigurations(auth, {
    agentIds: uniqueAgentIds,
    variant: "light",
  });

  const agentById = new Map(agentConfigurations.map((a) => [a.sId, a]));

  const triggers = removeNulls(
    editorTriggers.map((trigger) => {
      const agent = agentById.get(trigger.agentConfigurationId);
      if (!agent) {
        return null;
      }
      return {
        ...trigger.toJSON(),
        isEditor: true,
        agentName: agent.name,
        agentPictureUrl: agent.pictureUrl,
      };
    })
  );

  return res.status(200).json({ triggers });
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
