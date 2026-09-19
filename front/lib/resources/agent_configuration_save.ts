import { isSelfHostedImageWithValidContentType } from "@app/lib/api/assistant/configuration/agent_image";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { TagResource } from "@app/lib/resources/tags_resource";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationScope,
  AgentModelConfigurationType,
  AgentReinforcementMode,
  AgentStatus,
} from "@app/types/assistant/agent";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import { validateResponseFormat } from "@app/types/assistant/models/utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { TagType } from "@app/types/tag";
import type { LightWorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";

// Model-level helpers for `AgentResource._saveConfiguration`. Each runs against the models directly
// and, when called inside the save transaction, throws on failure so the whole save rolls back (see
// the `agent-save-atomic` contract). They deliberately do NOT import `AgentResource` — the
// resource-coupled steps (current-version pointer, editor group) stay in `_saveConfiguration`.

// Validates the request-shaped inputs that do not touch the database. Returns an `Err` (not a throw)
// because it runs before the save transaction is opened.
export async function validateAgentSaveInputs({
  pictureUrl,
  model,
}: {
  pictureUrl: string;
  model: AgentModelConfigurationType;
}): Promise<Result<void, Error>> {
  const isValidPictureUrl =
    await isSelfHostedImageWithValidContentType(pictureUrl);
  if (!isValidPictureUrl) {
    return new Err(new Error("Invalid picture url."));
  }

  if (model.responseFormat) {
    const formatValidation = validateResponseFormat(model.responseFormat);
    if (!formatValidation.isValid) {
      return new Err(
        new Error(`Invalid response format: ${formatValidation.errorMessage}`)
      );
    }
  }

  return new Ok(undefined);
}

// Resolves the current scope of an agent being re-saved, without opening the save transaction.
// A new agent starts hidden, so saving it visible counts as publishing.
async function getCurrentScope(
  agentConfigurationId: string | undefined,
  owner: LightWorkspaceType
): Promise<AgentConfigurationScope> {
  if (!agentConfigurationId) {
    return "hidden";
  }
  const existingAgent = await AgentConfigurationModel.findOne({
    where: { sId: agentConfigurationId, workspaceId: owner.id },
    order: [["version", "DESC"]],
    attributes: ["scope"],
    limit: 1,
  });
  return existingAgent?.scope ?? "hidden";
}

// With only `hidden`/`visible` scopes for custom agents, a scope change on an active agent is exactly
// a publish (→ visible) or unpublish (→ hidden), both of which need publish permission. Returns an
// `Err` (not a throw): it runs before the save transaction is opened.
export async function assertPublishPermissionForScopeChange(
  auth: Authenticator,
  {
    agentConfigurationId,
    status,
    scope,
    owner,
  }: {
    agentConfigurationId: string | undefined;
    status: AgentStatus;
    scope: Exclude<AgentConfigurationScope, "global">;
    owner: LightWorkspaceType;
  }
): Promise<Result<void, Error>> {
  if (status !== "active") {
    return new Ok(undefined);
  }
  const currentScope = await getCurrentScope(agentConfigurationId, owner);
  if (currentScope !== scope) {
    const canPublish = await auth.hasWorkspacePermission("publish", "agent");
    if (!canPublish) {
      return new Err(new Error("You don't have permission to publish agents."));
    }
  }
  return new Ok(undefined);
}

// Resolves the latest version of the agent being saved and the version number of the version about to
// be written, archiving the prior versions on a regular update. Runs inside the save transaction and
// throws on any violation so the whole save rolls back.
export async function resolveExistingAgentAndVersion(
  auth: Authenticator,
  {
    agentConfigurationId,
    authorId,
    owner,
    transaction: t,
  }: {
    agentConfigurationId: string | undefined;
    authorId: ModelId;
    owner: LightWorkspaceType;
    transaction: Transaction;
  }
): Promise<{ existingAgent: AgentConfigurationModel | null; version: number }> {
  let version = 0;
  let existingAgent: AgentConfigurationModel | null = null;

  if (agentConfigurationId) {
    existingAgent = await AgentConfigurationModel.findOne({
      where: {
        sId: agentConfigurationId,
        workspaceId: owner.id,
      },
      attributes: [
        "agentId",
        "scope",
        "version",
        "id",
        "sId",
        "status",
        "authorId",
        "workspaceId",
        "createdAt",
        "reinforcement",
      ],
      order: [["version", "DESC"]],
      transaction: t,
      limit: 1,
    });

    if (existingAgent) {
      if (existingAgent.status === "archived") {
        throw new Error(
          "An archived agent cannot be updated. Restore it first."
        );
      }

      // Handle pending agent: update in place (don't bump version, preserve id for FK relationships)
      // Otherwise: archive old versions and bump version
      if (existingAgent.status === "pending") {
        if (existingAgent.authorId === authorId) {
          const timeToCreationMs =
            Date.now() - existingAgent.createdAt.getTime();
          logger.info(
            {
              agentId: existingAgent.sId,
              workspaceId: owner.sId,
              timeToCreationMs,
            },
            "Agent created from pending status"
          );
        } else {
          throw new Error(
            "Cannot update a pending agent owned by another user."
          );
        }
      } else {
        // Regular update: bump version and archive old versions
        version = existingAgent.version + 1;
        await AgentConfigurationModel.update(
          { status: "archived" },
          {
            where: {
              sId: agentConfigurationId,
              workspaceId: owner.id,
            },
            transaction: t,
          }
        );
      }
    }
  }

  // `existingAgent` is null both when no `agentConfigurationId` was given and when one was given but
  // didn't match a real row — the latter would otherwise let a caller bypass the capability check by
  // passing a nonexistent id and taking the "create new" branch below.
  if (!existingAgent) {
    const canCreate = await auth.hasWorkspacePermission("create", "agent");
    if (!canCreate) {
      throw new Error("Creating agents is restricted.");
    }
  }

  return { existingAgent, version };
}

// Resolves the agent's stable `sId` and its `AgentModel` identity, creating the identity row for a
// brand-new agent and backfilling `agentId` on any pre-existing configuration rows. Runs inside the
// save transaction.
export async function resolveAgentIdentity({
  agentConfigurationId,
  existingAgent,
  owner,
  transaction: t,
}: {
  agentConfigurationId: string | undefined;
  existingAgent: AgentConfigurationModel | null;
  owner: LightWorkspaceType;
  transaction: Transaction;
}): Promise<{ sId: string; agentModelId: ModelId }> {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const sId = agentConfigurationId || generateRandomModelSId();
  let agentModelId = existingAgent?.agentId;
  if (!agentModelId) {
    const [agentIdentity] = await AgentModel.findOrCreate({
      where: { sId, workspaceId: owner.id },
      defaults: { sId, workspaceId: owner.id },
      transaction: t,
    });
    agentModelId = agentIdentity.id;
    await AgentConfigurationModel.update(
      { agentId: agentModelId },
      {
        where: { sId, workspaceId: owner.id },
        transaction: t,
      }
    );
  }
  return { sId, agentModelId };
}

// Writes the configuration row for the version being saved: an in-place update for a pending agent
// (preserving its id and FK relationships), a fresh row otherwise. Runs inside the save transaction.
export async function writeAgentConfigurationRow({
  existingAgent,
  sId,
  agentModelId,
  version,
  name,
  description,
  instructions,
  instructionsHtml,
  model,
  status,
  scope,
  pictureUrl,
  authorId,
  templateModelId,
  requestedSpaceIds,
  reinforcement,
  owner,
  transaction: t,
}: {
  existingAgent: AgentConfigurationModel | null;
  sId: string;
  agentModelId: ModelId;
  version: number;
  name: string;
  description: string;
  instructions: string | null;
  instructionsHtml: string | null;
  model: AgentModelConfigurationType;
  status: AgentStatus;
  scope: Exclude<AgentConfigurationScope, "global">;
  pictureUrl: string;
  authorId: ModelId;
  templateModelId: ModelId | undefined;
  requestedSpaceIds: ModelId[];
  reinforcement: AgentReinforcementMode | undefined;
  owner: LightWorkspaceType;
  transaction: Transaction;
}): Promise<AgentConfigurationModel> {
  // Columns shared by the two write paths below. The identity columns (`sId`, `agentId`,
  // `workspaceId`) are added only on create — an in-place pending update preserves them.
  const configFields = {
    version,
    status,
    scope,
    name,
    description,
    instructions,
    instructionsHtml,
    providerId: model.providerId,
    modelId: model.modelId,
    temperature: model.temperature,
    reasoningEffort: model.reasoningEffort,
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    pictureUrl,
    authorId,
    templateId: templateModelId,
    requestedSpaceIds,
    responseFormat: model.responseFormat,
    reinforcement: reinforcement ?? existingAgent?.reinforcement ?? "auto",
  };

  if (existingAgent && existingAgent.status === "pending") {
    // Update pending agent in place to preserve id (and FK relationships like suggestions).
    // `returning: true` hands back the updated row, so no reload query is needed.
    const [, [updatedAgent]] = await AgentConfigurationModel.update(
      configFields,
      {
        where: {
          id: existingAgent.id,
          workspaceId: owner.id,
        },
        transaction: t,
        returning: true,
      }
    );
    if (!updatedAgent) {
      throw new Error("Failed to reload updated agent configuration");
    }
    return updatedAgent;
  }

  return AgentConfigurationModel.create(
    {
      ...configFields,
      sId,
      agentId: agentModelId,
      workspaceId: owner.id,
    },
    {
      transaction: t,
    }
  );
}

// Attaches the agent's tags to the freshly-written configuration row, enforcing that a caller who
// cannot manage protected tags neither adds nor removes any. Runs inside the save transaction and
// throws on a protected-tag violation so the whole save rolls back.
export async function syncAgentTags(
  auth: Authenticator,
  {
    existingAgent,
    agentConfigurationInstance,
    tags,
    status,
    owner,
    transaction: t,
  }: {
    existingAgent: AgentConfigurationModel | null;
    agentConfigurationInstance: AgentConfigurationModel;
    tags: TagType[];
    status: AgentStatus;
    owner: LightWorkspaceType;
    transaction: Transaction;
  }
): Promise<void> {
  const canManageProtectedTags = await auth.hasWorkspacePermission(
    "publish",
    "agent"
  );

  const existingTags = existingAgent
    ? await TagResource.listForAgent(auth, existingAgent.id)
    : [];
  const existingReservedTags = existingTags
    .filter((tag) => tag.kind === "protected")
    .map((tag) => tag.sId);
  if (
    !canManageProtectedTags &&
    !existingReservedTags.every((reservedTagId) =>
      tags.some((tag) => tag.sId === reservedTagId)
    )
  ) {
    throw new Error("Cannot remove reserved tag from agent");
  }

  if (status !== "active") {
    return;
  }

  const tagResources = await TagResource.fetchByIds(
    auth,
    tags.map((tag) => tag.sId)
  );
  const tagResourceById = new Map(
    tagResources.map((tagResource) => [tagResource.sId, tagResource])
  );

  for (const tag of tags) {
    const tagResource = tagResourceById.get(tag.sId);
    if (tagResource) {
      if (
        !canManageProtectedTags &&
        tagResource.kind === "protected" &&
        !existingReservedTags.includes(tagResource.sId)
      ) {
        throw new Error("Cannot add reserved tag to agent");
      }
      await TagAgentModel.create(
        {
          workspaceId: owner.id,
          tagId: tagResource.id,
          agentConfigurationId: agentConfigurationInstance.id,
        },
        { transaction: t }
      );
    }
  }
}
