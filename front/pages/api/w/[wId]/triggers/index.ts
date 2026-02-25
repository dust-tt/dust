import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { TriggerType } from "@app/types/assistant/triggers";
import { TriggerSchema } from "@app/types/assistant/triggers";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type WorkspaceTriggerType = TriggerType & {
  isSubscriber: boolean;
  isEditor: boolean;
  editorName?: string;
  agentName?: string;
  agentPictureUrl?: string;
  agentConfigurationSId: string;
};

export interface GetWorkspaceTriggersResponseBody {
  triggers: WorkspaceTriggerType[];
}

const PostTriggerRequestBodyCodec = t.intersection([
  t.type({
    agentConfigurationId: t.string,
    trigger: TriggerSchema,
  }),
  t.partial({}),
]);
export type PostTriggerRequestBody = t.TypeOf<
  typeof PostTriggerRequestBodyCodec
>;

// Helper type guard for decoded trigger data from TriggerSchema
function isWebhookTriggerData(trigger: {
  kind: string;
  webhookSourceViewSId?: unknown;
}): trigger is { kind: "webhook"; webhookSourceViewSId: string } {
  return (
    trigger.kind === "webhook" &&
    typeof trigger.webhookSourceViewSId === "string"
  );
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceTriggersResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const { tab } = req.query;
      const tabValue = isString(tab) ? tab : "all";

      const user = auth.getNonNullableUser();
      let triggers: TriggerResource[];

      switch (tabValue) {
        case "my_triggers":
          triggers = await TriggerResource.listByUserEditor(auth, user);
          break;
        case "subscribed":
          triggers = await TriggerResource.listByUserSubscriber(auth, user);
          break;
        case "all":
        default:
          triggers = await TriggerResource.listByWorkspace(auth);
          break;
      }

      // Fetch all editor users in batch.
      const editorIds = [...new Set(triggers.map((trigger) => trigger.editor))];
      const editorUsers = await UserResource.fetchByModelIds(editorIds);
      const editorNamesMap = new Map(
        editorUsers.map((u) => [u.id, u.fullName()])
      );

      // Fetch agent configurations for all unique agent IDs.
      const agentConfigIds = [
        ...new Set(triggers.map((t) => t.agentConfigurationId)),
      ];
      const agentConfigs = await Promise.all(
        agentConfigIds.map((agentId) =>
          getAgentConfiguration(auth, { agentId, variant: "light" })
        )
      );
      const agentConfigMap = new Map(
        agentConfigs.filter((c) => c !== null).map((c) => [c.sId, c])
      );

      // Filter out triggers whose agent the user can't read.
      const accessibleTriggers = triggers.filter((t) =>
        agentConfigMap.has(t.agentConfigurationId)
      );

      const triggersWithMeta = await Promise.all(
        accessibleTriggers.map(async (trigger) => {
          // Safe to assert: we filtered above.
          const agentConfig = agentConfigMap.get(trigger.agentConfigurationId)!;
          return {
            ...trigger.toJSON(),
            isSubscriber: await trigger.isSubscriber(auth),
            isEditor: trigger.editor === user.id,
            editorName: editorNamesMap.get(trigger.editor),
            agentName: agentConfig.name,
            agentPictureUrl: agentConfig.pictureUrl,
            agentConfigurationSId: trigger.agentConfigurationId,
          };
        })
      );

      return res.status(200).json({ triggers: triggersWithMeta });
    }

    case "POST": {
      const postDecoded = PostTriggerRequestBodyCodec.decode(req.body);
      if (isLeft(postDecoded)) {
        const pathError = reporter.formatValidationErrors(postDecoded.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { agentConfigurationId, trigger: triggerData } = postDecoded.right;

      // Permission check: canRead on the agent instead of canEdit.
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: agentConfigurationId,
        variant: "light",
      });

      if (
        !agentConfiguration ||
        (!agentConfiguration.canRead && !auth.isAdmin())
      ) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "You need read access to this agent to create a trigger.",
          },
        });
      }

      const triggerValidation = TriggerSchema.decode({
        ...triggerData,
        editor: auth.getNonNullableUser().id,
      });

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
      const workspace = auth.getNonNullableWorkspace();

      const webhookSourceViewId = isWebhookTriggerData(validatedTrigger)
        ? getResourceIdFromSId(validatedTrigger.webhookSourceViewSId)
        : null;

      const executionPerDay = isWebhookTriggerData(validatedTrigger)
        ? validatedTrigger.executionPerDayLimitOverride
        : null;

      const newTrigger = await TriggerResource.makeNew(auth, {
        workspaceId: workspace.id,
        agentConfigurationId,
        name: validatedTrigger.name,
        kind: validatedTrigger.kind,
        status: validatedTrigger.status ?? "enabled",
        configuration: validatedTrigger.configuration,
        naturalLanguageDescription: validatedTrigger.naturalLanguageDescription,
        customPrompt: validatedTrigger.customPrompt,
        editor: auth.getNonNullableUser().id,
        webhookSourceViewId,
        executionPerDayLimitOverride: executionPerDay,
        executionMode: validatedTrigger.kind === "webhook" ? "fair_use" : null,
        origin: "user",
      });

      if (newTrigger.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            agentConfigurationId,
            triggerName: validatedTrigger.name,
            error: newTrigger.error,
          },
          "Failed to create trigger"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to create trigger ${validatedTrigger.name}.`,
          },
        });
      }

      res.status(201).end();
      return;
    }

    default:
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

export default withLogging(withSessionAuthenticationForWorkspace(handler));
