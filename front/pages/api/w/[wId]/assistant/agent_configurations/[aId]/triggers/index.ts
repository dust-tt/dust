import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type {
  TriggerConfiguration,
  TriggerType,
} from "@app/types/assistant/triggers";
import { TriggerSchema } from "@app/types/assistant/triggers";

export interface GetTriggersResponseBody {
  triggers: (TriggerType & {
    isSubscriber: boolean;
    isEditor: boolean;
    editorEmail?: string;
  })[];
}

export interface PatchTriggersRequestBody {
  triggers: Array<
    {
      sId?: string;
      name: string;
      customPrompt: string;
    } & TriggerConfiguration
  >;
}

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

type DecodedTrigger = {
  name: string;
  kind: "schedule" | "webhook";
  configuration: any;
  customPrompt: string;
  editor?: number;
  webhookSourceViewSId?: string;
};

function validateAndDecodeTriggers(
  triggers: any[],
  req: NextApiRequest,
  res: NextApiResponse
): { sId?: string; data: DecodedTrigger }[] | null {
  const decodedTriggers: Array<{ sId?: string; data: DecodedTrigger }> = [];

  for (const triggerData of triggers) {
    const validation = TriggerSchema.decode(triggerData);
    if (isLeft(validation)) {
      const validationError = reporter.formatValidationErrors(validation.left);
      apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid trigger data: ${validationError}`,
        },
      });
      return null;
    }
    decodedTriggers.push({
      sId: triggerData.sId,
      data: validation.right,
    });
  }

  return decodedTriggers;
}

function validateNamesAndConflicts(
  allTriggers: TriggerResource[],
  incoming: Array<{ sId?: string; name: string }>,
  req: NextApiRequest,
  res: NextApiResponse
): boolean {
  // Normalize once
  const normalized = incoming.map((t, idx) => ({
    index: idx + 1,
    sId: t.sId,
    name: typeof t.name === "string" ? t.name.trim() : "",
  }));

  // Empty-name check
  const emptyIndexes = normalized.filter((n) => !n.name).map((n) => n.index);
  if (emptyIndexes.length > 0) {
    apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          emptyIndexes.length === 1
            ? `Trigger name #${emptyIndexes[0]} cannot be empty.`
            : `Trigger names #${emptyIndexes.join(", ")} cannot be empty.`,
      },
    });
    return false;
  }

  // Duplicate detection among incoming
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const n of normalized) {
    if (seen.has(n.name)) {
      dupes.add(n.name);
    } else {
      seen.add(n.name);
    }
  }
  if (dupes.size > 0) {
    const duplicates = [...dupes];
    apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          duplicates.length === 1
            ? `Duplicate trigger name: "${duplicates[0]}".`
            : `Duplicate trigger names: ${duplicates
                .map((d) => `"${d}"`)
                .join(", ")}.`,
      },
    });
    return false;
  }

  // Conflicts against existing triggers
  const existingById = new Map<string, TriggerResource>();
  const existingNames = new Set<string>();
  for (const t of allTriggers) {
    existingById.set(t.sId(), t);
    existingNames.add(t.name);
  }

  for (const n of normalized) {
    if (!n.name) {
      continue;
    }

    if (n.sId && existingById.has(n.sId)) {
      const existing = existingById.get(n.sId)!;
      if (existing.name === n.name) {
        continue; // unchanged
      }
      if (existingNames.has(n.name)) {
        apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Trigger name "${n.name}" already exists.`,
          },
        });
        return false;
      }
      continue;
    }

    if (existingNames.has(n.name)) {
      apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Trigger name "${n.name}" already exists.`,
        },
      });
      return false;
    }
  }

  return true;
}

function categorizeTriggerOperations(
  decodedTriggers: Array<{ sId?: string; data: DecodedTrigger }>,
  existingTriggersMap: Map<string, TriggerResource>,
  existingTriggersForEditor: TriggerResource[],
  currentUserId: number
): {
  toCreate: DecodedTrigger[];
  toUpdate: Array<{ existing: TriggerResource; data: DecodedTrigger }>;
  toDelete: TriggerResource[];
} {
  const operations: {
    toCreate: DecodedTrigger[];
    toUpdate: Array<{ existing: TriggerResource; data: DecodedTrigger }>;
    toDelete: TriggerResource[];
  } = { toCreate: [], toUpdate: [], toDelete: [] };

  for (const { sId, data } of decodedTriggers) {
    // Skip triggers owned by other users
    if (data.editor && data.editor !== currentUserId) {
      continue;
    }

    if (sId && existingTriggersMap.has(sId)) {
      operations.toUpdate.push({
        existing: existingTriggersMap.get(sId)!,
        data,
      });
    } else {
      operations.toCreate.push(data);
    }
  }

  // Find triggers to delete: existing triggers not being updated
  const updatedTriggerIds = new Set(
    operations.toUpdate.map((update) => update.existing.sId())
  );
  operations.toDelete = existingTriggersForEditor.filter(
    (trigger) => !updatedTriggerIds.has(trigger.sId())
  );

  return operations;
}

// validateNoConflictsWithExisting is merged into validateNamesAndConflicts

async function updateTriggers(
  auth: Authenticator,
  toUpdate: Array<{ existing: TriggerResource; data: DecodedTrigger }>
): Promise<{ triggers: TriggerType[]; errors: Error[] }> {
  const resultTriggers: TriggerType[] = [];
  const errors: Error[] = [];

  for (const { existing, data } of toUpdate) {
    const webhookSourceViewId = isWebhookTriggerData(data)
      ? getResourceIdFromSId(data.webhookSourceViewSId)
      : null;

    const updatedTrigger = await TriggerResource.update(auth, existing.sId(), {
      ...data,
      webhookSourceViewId,
    });

    if (updatedTrigger.isErr()) {
      errors.push(new Error("Failed to update trigger"));
      continue;
    }
    resultTriggers.push(updatedTrigger.value.toJSON());
  }

  return { triggers: resultTriggers, errors };
}

async function createTriggers(
  auth: Authenticator,
  toCreate: DecodedTrigger[],
  workspaceId: number,
  agentConfigurationId: string
): Promise<{ triggers: TriggerType[]; errors: Error[] }> {
  const resultTriggers: TriggerType[] = [];
  const errors: Error[] = [];

  for (const data of toCreate) {
    const webhookSourceViewId = isWebhookTriggerData(data)
      ? getResourceIdFromSId(data.webhookSourceViewSId)
      : null;

    const newTrigger = await TriggerResource.makeNew(auth, {
      workspaceId,
      agentConfigurationId,
      name: data.name,
      kind: data.kind,
      configuration: data.configuration,
      customPrompt: data.customPrompt,
      editor: auth.getNonNullableUser().id,
      webhookSourceViewId,
    });

    if (newTrigger.isErr()) {
      errors.push(newTrigger.error);
      continue;
    }
    resultTriggers.push(newTrigger.value.toJSON());
  }

  return { triggers: resultTriggers, errors };
}

async function deleteTriggers(
  auth: Authenticator,
  toDelete: TriggerResource[]
): Promise<{ errors: Error[] }> {
  const errors: Error[] = [];
  for (const trigger of toDelete) {
    const r = await trigger.delete(auth);
    if (r.isErr()) {
      errors.push(r.error);
    }
  }
  return { errors };
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

  const allTriggers = await TriggerResource.listByAgentConfigurationId(
    auth,
    agentConfigurationId
  );

  /**
   * Existing triggers owned by the current user (editor).
   */
  const existingTriggerForEditor = allTriggers.filter(
    (trigger) => trigger.editor === auth.getNonNullableUser().id
  );

  switch (req.method) {
    case "GET": {
      // Fetch all editor users in batch
      const editorIds = [
        ...new Set(allTriggers.map((trigger) => trigger.editor)),
      ];
      const editorUsers = await UserResource.fetchByModelIds(editorIds);
      const editorEmailMap = new Map(
        editorUsers.map((user) => [user.id, user.email])
      );

      const triggersWithIsSubscriber = await Promise.all(
        allTriggers.map(async (trigger) => ({
          ...trigger.toJSON(),
          isSubscriber: await trigger.isSubscriber(auth),
          isEditor: trigger.editor === auth.getNonNullableUser().id,
          editorEmail: editorEmailMap.get(trigger.editor),
        }))
      );

      return res.status(200).json({
        triggers: triggersWithIsSubscriber,
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

      const { triggers } = req.body;
      const workspace = auth.getNonNullableWorkspace();
      const currentUserId = auth.getNonNullableUser().id;

      // Validate and decode the trigger payload
      const decodedTriggers = validateAndDecodeTriggers(triggers, req, res);
      if (!decodedTriggers) {
        return;
      }

      // Categorize triggers into create, update operations
      const existingTriggersMap = new Map(
        existingTriggerForEditor.map((trigger) => [trigger.sId(), trigger])
      );

      const { toCreate, toUpdate, toDelete } = categorizeTriggerOperations(
        decodedTriggers,
        existingTriggersMap,
        existingTriggerForEditor,
        currentUserId
      );

      // Validate incoming names (non-empty, unique among themselves) and conflicts with existing
      const incomingMinimal = decodedTriggers.map(({ sId, data }) => ({
        sId,
        name: data.name,
      }));
      if (!validateNamesAndConflicts(allTriggers, incomingMinimal, req, res)) {
        return;
      }

      // Execute the operations
      const updateResult = await updateTriggers(auth, toUpdate);
      const createResult = await createTriggers(
        auth,
        toCreate,
        workspace.id,
        agentConfigurationId
      );
      const deleteResult = await deleteTriggers(auth, toDelete);

      // Handle any errors that occurred during processing
      const allErrors = [
        ...updateResult.errors,
        ...createResult.errors,
        ...deleteResult.errors,
      ];
      if (allErrors.length > 0) {
        logger.error(
          {
            errors: allErrors.map((e) => e.message),
            workspaceId: workspace.id,
            agentConfigurationId: agentConfiguration.id,
          },
          `Failed to process ${allErrors.length} triggers.`
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to process ${allErrors.length} triggers`,
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
