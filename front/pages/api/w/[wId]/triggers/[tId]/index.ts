import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { TriggerType } from "@app/types/assistant/triggers";
import { TriggerSchema } from "@app/types/assistant/triggers";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type TriggerDetailType = TriggerType & {
  isSubscriber: boolean;
  isEditor: boolean;
  editorName?: string;
  agentName?: string;
  agentPictureUrl?: string;
  agentConfigurationSId: string;
};

export interface GetTriggerDetailResponseBody {
  trigger: TriggerDetailType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetTriggerDetailResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  const { tId } = req.query;

  if (!isString(tId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid trigger ID.",
      },
    });
  }

  const trigger = await TriggerResource.fetchById(auth, tId);
  if (!trigger) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "The trigger was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const user = auth.getNonNullableUser();

      const editorUser = await UserResource.fetchByModelId(trigger.editor);
      const agentConfig = await getAgentConfiguration(auth, {
        agentId: trigger.agentConfigurationId,
        variant: "light",
      });

      const triggerDetail: TriggerDetailType = {
        ...trigger.toJSON(),
        isSubscriber: await trigger.isSubscriber(auth),
        isEditor: trigger.editor === user.id,
        editorName: editorUser?.fullName(),
        agentName: agentConfig?.name,
        agentPictureUrl: agentConfig?.pictureUrl,
        agentConfigurationSId: trigger.agentConfigurationId,
      };

      return res.status(200).json({ trigger: triggerDetail });
    }

    case "PATCH": {
      const user = auth.getNonNullableUser();

      if (trigger.editor !== user.id && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the trigger editor or an admin can update this trigger.",
          },
        });
      }

      const patchDecoded = TriggerSchema.decode({
        ...req.body,
        editor: user.id,
      });
      if (isLeft(patchDecoded)) {
        const pathError = reporter.formatValidationErrors(patchDecoded.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const updatedTrigger = await TriggerResource.update(
        auth,
        tId,
        patchDecoded.right
      );

      if (updatedTrigger.isErr()) {
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            triggerId: tId,
            error: updatedTrigger.error,
          },
          "Failed to update trigger"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to update trigger.",
          },
        });
      }

      res.status(200).json({
        trigger: {
          ...updatedTrigger.value.toJSON(),
          isSubscriber: await updatedTrigger.value.isSubscriber(auth),
          isEditor: true,
          agentConfigurationSId: updatedTrigger.value.agentConfigurationId,
        },
      });
      return;
    }

    case "DELETE": {
      const user = auth.getNonNullableUser();

      if (trigger.editor !== user.id && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the trigger editor or an admin can delete this trigger.",
          },
        });
      }

      const deleteResult = await trigger.delete(auth);
      if (deleteResult.isErr()) {
        logger.error(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            triggerId: tId,
            error: deleteResult.error,
          },
          "Failed to delete trigger"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete trigger.",
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
            "The method passed is not supported, GET, PATCH, or DELETE is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
