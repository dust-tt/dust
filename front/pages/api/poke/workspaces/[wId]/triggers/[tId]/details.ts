import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { UserType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeGetTriggerDetails = {
  trigger: TriggerType;
  agent: LightAgentConfigurationType;
  editorUser: UserType | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetTriggerDetails>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, tId } = req.query;
  if (typeof wId !== "string" || typeof tId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or trigger ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const trigger = await TriggerResource.fetchById(auth, tId);
      if (!trigger) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "trigger_not_found",
            message: "Trigger not found.",
          },
        });
      }

      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: trigger.agentConfigurationId,
        variant: "full",
      });
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "Agent configuration not found.",
          },
        });
      }

      // Fetch editor user
      const editorUsers = trigger.editor
        ? await UserResource.fetchByModelIds([trigger.editor])
        : [];
      const editorUser =
        editorUsers.length > 0 ? editorUsers[0].toJSON() : null;

      return res.status(200).json({
        trigger: trigger.toJSON(),
        agent: agentConfiguration,
        editorUser,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
