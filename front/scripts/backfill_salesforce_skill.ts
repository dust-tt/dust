import { matchesInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { convertMarkdownToBlockHtml } from "@app/lib/reinforcement/skill_instructions_html";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { serializeSkillTag } from "@app/lib/skills/format";
import { parseToolTag, TOOL_TAG_REGEX } from "@app/lib/tools/format";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

const WORKSPACE_CONCURRENCY = 16;

const SALESFORCE_SKILL_NAME = "Work with Salesforce";
const SALESFORCE_SKILL_ICON = "SalesforceLogo";
const SALESFORCE_SKILL_USER_DESCRIPTION =
  "Helps agents use Salesforce tools with the right discovery flow.";
const SALESFORCE_SKILL_AGENT_DESCRIPTION =
  "Use this skill whenever you need to inspect, query, create, update, or read attachments from Salesforce.";

const SALESFORCE_SKILL_INSTRUCTIONS = `Use Salesforce tools when the user asks about Salesforce records, objects, fields, relationships, attachments, or record changes.

# General Workflow for Salesforce Data
1. **List Objects (Optional):** If you don't know the exact name of an object, use \`list_objects\` to find it.
2. **Describe Object:** Use \`describe_object\` with the specific object name, such as \`Account\`, \`Lead\`, or \`MyCustomObject__c\`, to inspect its metadata before querying or writing.
3. **Execute Read Query:** Use \`execute_read_query\` to retrieve or discover data with SOQL. It is read-only and must never be used to write data. Construct SOQL from \`describe_object\` output so field and relationship names are exact.

# Best Practices
- Start with metadata when the object, field names, relationships, record types, or required fields are not already known. This helps prevent misspelled or non-existent field, object, and relationship names.
- For a quick field list directly in a query, use \`FIELDS(ALL)\`, \`FIELDS(CUSTOM)\`, or \`FIELDS(STANDARD)\` in the \`SELECT\` statement. \`FIELDS()\` requires a \`LIMIT\` clause, with a maximum of 200.
- If Salesforce returns "No such column" or "Didn't understand relationship", use \`describe_object\` on the relevant object or objects to verify exact API names and relationship names before retrying.
- If errors persist after using \`describe_object\`, the field, object, or relationship might genuinely not exist, or the connected user may lack permissions.
- Before writing data, confirm the target object, record IDs, and required field values.`;

interface ActiveSalesforceAgentUsage {
  activeAgentMCPServerViewModelIds: ModelId[];
  agents: AgentConfigurationModel[];
  mcpServerConfigurationModelIds: ModelId[];
  mcpServerViewModelIds: ModelId[];
}

async function findLatestActiveSalesforceAgentUsage(
  workspace: LightWorkspaceType
): Promise<ActiveSalesforceAgentUsage> {
  const salesforceMCPServerViews = await MCPServerViewModel.findAll({
    where: {
      workspaceId: workspace.id,
      serverType: "internal",
      internalMCPServerId: { [Op.ne]: null },
    },
  });
  const salesforceMCPServerViewModelIds = salesforceMCPServerViews
    .filter((view) =>
      matchesInternalMCPServerName(view.internalMCPServerId, "salesforce")
    )
    .map((view) => view.id);

  if (salesforceMCPServerViewModelIds.length === 0) {
    return {
      activeAgentMCPServerViewModelIds: [],
      agents: [],
      mcpServerConfigurationModelIds: [],
      mcpServerViewModelIds: [],
    };
  }

  const mcpConfigurations = await AgentMCPServerConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      mcpServerViewId: { [Op.in]: salesforceMCPServerViewModelIds },
    },
  });
  const salesforceAgentConfigurationModelIds = new Set(
    mcpConfigurations.map((config) => config.agentConfigurationId)
  );

  if (salesforceAgentConfigurationModelIds.size === 0) {
    return {
      activeAgentMCPServerViewModelIds: [],
      agents: [],
      mcpServerConfigurationModelIds: [],
      mcpServerViewModelIds: salesforceMCPServerViewModelIds,
    };
  }

  const salesforceAgentConfigurations = await AgentConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      id: [...salesforceAgentConfigurationModelIds],
      status: "active",
    },
  });

  const activeAgentConfigurationModelIds = new Set(
    salesforceAgentConfigurations.map((agent) => agent.id)
  );

  const activeMCPConfigurations = mcpConfigurations.filter((config) =>
    activeAgentConfigurationModelIds.has(config.agentConfigurationId)
  );

  return {
    activeAgentMCPServerViewModelIds: [
      ...new Set(
        activeMCPConfigurations.map((config) => config.mcpServerViewId)
      ),
    ],
    agents: salesforceAgentConfigurations.sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    mcpServerConfigurationModelIds: activeMCPConfigurations.map(
      (config) => config.id
    ),
    mcpServerViewModelIds: salesforceMCPServerViewModelIds,
  };
}

async function fetchActiveSalesforceSkill(
  auth: Authenticator
): Promise<SkillResource | null> {
  const owner = auth.getNonNullableWorkspace();

  const skillModel = await SkillConfigurationModel.findOne({
    where: {
      workspaceId: owner.id,
      name: SALESFORCE_SKILL_NAME,
      status: "active",
    },
  });

  if (!skillModel) {
    return null;
  }

  const skill = await SkillResource.fetchByModelIdWithAuth(auth, skillModel.id);
  if (!skill) {
    throw new Error(
      `Failed to fetch existing skill "${SALESFORCE_SKILL_NAME}" in workspace ${owner.sId}.`
    );
  }

  return skill;
}

async function fetchSalesforceMCPServerViews({
  auth,
  mcpServerViewModelIds,
  workspace,
}: {
  auth: Authenticator;
  mcpServerViewModelIds: ModelId[];
  workspace: LightWorkspaceType;
}): Promise<MCPServerViewResource[]> {
  const mcpServerViews = await MCPServerViewResource.fetchByModelIds(
    auth,
    mcpServerViewModelIds
  );

  if (mcpServerViews.length !== mcpServerViewModelIds.length) {
    throw new Error(
      `Could not fetch all Salesforce MCP server views in workspace ${workspace.sId}.`
    );
  }

  return mcpServerViews;
}

function getMissingSalesforceMCPServerViewModelIds({
  mcpServerViewModelIds,
  skill,
}: {
  mcpServerViewModelIds: ModelId[];
  skill: SkillResource;
}): ModelId[] {
  const skillMCPServerViewModelIds = new Set(
    skill.mcpServerViews.map((view) => view.id)
  );

  return mcpServerViewModelIds.filter(
    (mcpServerViewModelId) =>
      !skillMCPServerViewModelIds.has(mcpServerViewModelId)
  );
}

async function createSalesforceSkill({
  auth,
  mcpServerViews,
}: {
  auth: Authenticator;
  mcpServerViews: MCPServerViewResource[];
}): Promise<SkillResource> {
  const requestedSpaceIds = await SkillResource.computeRequestedSpaceIds(auth, {
    attachedKnowledge: [],
    mcpServerViews,
  });

  return SkillResource.makeNew(
    auth,
    {
      agentFacingDescription: SALESFORCE_SKILL_AGENT_DESCRIPTION,
      editedBy: null,
      icon: SALESFORCE_SKILL_ICON,
      instructions: SALESFORCE_SKILL_INSTRUCTIONS,
      instructionsHtml: convertMarkdownToBlockHtml(
        SALESFORCE_SKILL_INSTRUCTIONS
      ),
      isDefault: false,
      name: SALESFORCE_SKILL_NAME,
      reinforcement: "on",
      requestedSpaceIds,
      source: null,
      sourceMetadata: null,
      status: "active",
      userFacingDescription: SALESFORCE_SKILL_USER_DESCRIPTION,
    },
    {
      addCurrentUserAsEditor: false,
      attachedKnowledge: [],
      mcpServerViews,
    }
  );
}

async function addAgentEditorsToSkill(
  auth: Authenticator,
  {
    agentConfigurationModelIds,
    referencedSkillModelIds,
    logger,
    skill,
  }: {
    agentConfigurationModelIds: ModelId[];
    referencedSkillModelIds: ModelId[];
    logger: Logger;
    skill: SkillResource;
  }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  if (
    agentConfigurationModelIds.length === 0 &&
    referencedSkillModelIds.length === 0
  ) {
    return;
  }

  const [agentEditorLinks, skillEditorLinks] = await Promise.all([
    agentConfigurationModelIds.length > 0
      ? GroupAgentModel.findAll({
          where: {
            workspaceId: owner.id,
            agentConfigurationId: { [Op.in]: agentConfigurationModelIds },
          },
        })
      : [],
    referencedSkillModelIds.length > 0
      ? GroupSkillModel.findAll({
          where: {
            workspaceId: owner.id,
            skillConfigurationId: { [Op.in]: referencedSkillModelIds },
          },
        })
      : [],
  ]);
  const editorGroupModelIds = [
    ...new Set([
      ...agentEditorLinks.map((link) => link.groupId),
      ...skillEditorLinks.map((link) => link.groupId),
    ]),
  ];

  if (editorGroupModelIds.length === 0) {
    logger.warn(
      { skillId: skill.sId, workspaceId: owner.sId },
      "No editor groups found for Salesforce agents or skills"
    );
    return;
  }

  const skillEditorLink = await GroupSkillModel.findOne({
    where: {
      workspaceId: owner.id,
      skillConfigurationId: skill.id,
    },
  });

  if (!skillEditorLink) {
    throw new Error(
      `Could not find editor group for skill "${SALESFORCE_SKILL_NAME}" in workspace ${owner.sId}.`
    );
  }

  const groups = await GroupResource.fetchByModelIds(auth, [
    skillEditorLink.groupId,
    ...editorGroupModelIds,
  ]);
  const groupByModelId = new Map(groups.map((group) => [group.id, group]));

  const skillEditorGroup = groupByModelId.get(skillEditorLink.groupId);
  if (!skillEditorGroup) {
    throw new Error(
      `Could not fetch editor group for skill "${SALESFORCE_SKILL_NAME}" in workspace ${owner.sId}.`
    );
  }
  const editorGroups = editorGroupModelIds
    .filter((groupModelId) => groupModelId !== skillEditorLink.groupId)
    .map((groupModelId) => groupByModelId.get(groupModelId) ?? null)
    .filter((group): group is GroupResource => group !== null);

  const activeAgentEditorMemberships =
    await GroupResource.getActiveMembershipsForGroups(auth, editorGroups);
  const agentEditorUserModelIds = [
    ...new Set(Object.values(activeAgentEditorMemberships).flat()),
  ];

  if (agentEditorUserModelIds.length === 0) {
    logger.warn(
      { skillId: skill.sId, workspaceId: owner.sId },
      "No editor members found for Salesforce agents or skills"
    );
    return;
  }

  const users = await UserResource.fetchByModelIds(agentEditorUserModelIds);
  const { memberships } = await MembershipResource.getActiveMemberships({
    users,
    workspace: owner,
  });
  const builderUserModelIds = new Set(
    memberships
      .filter((membership) => membership.isBuilder)
      .map((membership) => membership.userId)
  );

  const existingSkillEditors = await skillEditorGroup.getActiveMembers(auth);
  const existingSkillEditorModelIds = new Set(
    existingSkillEditors.map((user) => user.id)
  );
  const usersToAdd = users.filter(
    (user) =>
      builderUserModelIds.has(user.id) &&
      !existingSkillEditorModelIds.has(user.id)
  );

  if (usersToAdd.length === 0) {
    logger.info(
      {
        skippedNonBuilderEditorCount:
          agentEditorUserModelIds.length - builderUserModelIds.size,
        skillId: skill.sId,
        workspaceId: owner.sId,
      },
      "Salesforce skill editors already up to date"
    );
    return;
  }

  const result = await skillEditorGroup.dangerouslyAddMembers(auth, {
    users: usersToAdd.map((user) => user.toJSON()),
  });
  if (result.isErr()) {
    throw result.error;
  }

  logger.info(
    {
      addedEditorCount: usersToAdd.length,
      skippedNonBuilderEditorCount:
        agentEditorUserModelIds.length - builderUserModelIds.size,
      skillId: skill.sId,
      workspaceId: owner.sId,
    },
    "Added Salesforce skill editors"
  );
}

async function getAgentModelIdsMissingSkill({
  agentConfigurationModelIds,
  skill,
  workspace,
}: {
  agentConfigurationModelIds: ModelId[];
  skill: SkillResource;
  workspace: LightWorkspaceType;
}): Promise<ModelId[]> {
  if (agentConfigurationModelIds.length === 0) {
    return [];
  }

  const existingLinks = await AgentSkillModel.findAll({
    where: {
      workspaceId: workspace.id,
      customSkillId: skill.id,
      agentConfigurationId: { [Op.in]: agentConfigurationModelIds },
    },
  });
  const agentModelIdsWithSkill = new Set(
    existingLinks.map((link) => link.agentConfigurationId)
  );

  return agentConfigurationModelIds.filter(
    (agentModelId) => !agentModelIdsWithSkill.has(agentModelId)
  );
}

function uniqModelIds(modelIds: ModelId[]): ModelId[] {
  return [...new Set(modelIds)];
}

function replaceToolReferencesWithSkillReference({
  content,
  salesforceMCPServerViewSIds,
  skill,
}: {
  content: string;
  salesforceMCPServerViewSIds: Set<string>;
  skill: SkillResource;
}): string {
  let replacedToolReference = false;
  const skillTag = serializeSkillTag({
    icon: skill.icon,
    id: skill.sId,
    name: skill.name,
  });

  const updatedContent = content.replace(TOOL_TAG_REGEX, (tag) => {
    const tool = parseToolTag(tag);
    if (!tool || !salesforceMCPServerViewSIds.has(tool.id)) {
      return tag;
    }

    replacedToolReference = true;
    return skillTag;
  });

  if (updatedContent.includes(`id="${skill.sId}"`)) {
    return updatedContent;
  }

  if (!replacedToolReference) {
    return `${updatedContent.trimEnd()}\n\nUse ${skillTag} for Salesforce work.`;
  }

  return updatedContent;
}

async function replaceSalesforceToolWithSkillInReferencedSkills(
  auth: Authenticator,
  {
    logger,
    mcpServerViews,
    referencedSkills,
    salesforceSkill,
  }: {
    logger: Logger;
    mcpServerViews: MCPServerViewResource[];
    referencedSkills: SkillResource[];
    salesforceSkill: SkillResource;
  }
): Promise<number> {
  const salesforceMCPServerViewModelIds = new Set(
    mcpServerViews.map((view) => view.id)
  );
  const salesforceMCPServerViewSIds = new Set(
    mcpServerViews.map((view) => view.sId)
  );

  let updatedSkillCount = 0;

  for (const referencedSkill of referencedSkills) {
    if (referencedSkill.id === salesforceSkill.id) {
      continue;
    }

    const filteredMCPServerViews = referencedSkill.mcpServerViews.filter(
      (view) => !salesforceMCPServerViewModelIds.has(view.id)
    );
    const attachedKnowledge = await referencedSkill.getAttachedKnowledge(auth);
    const previousComputedRequestedSpaceIds =
      await SkillResource.computeRequestedSpaceIds(auth, {
        attachedKnowledge,
        mcpServerViews: referencedSkill.mcpServerViews,
      });
    const previousComputedRequestedSpaceIdSet = new Set(
      previousComputedRequestedSpaceIds
    );
    const additionalRequestedSpaceIds =
      referencedSkill.requestedSpaceIds.filter(
        (spaceId) => !previousComputedRequestedSpaceIdSet.has(spaceId)
      );
    const computedRequestedSpaceIds =
      await SkillResource.computeRequestedSpaceIds(auth, {
        attachedKnowledge,
        mcpServerViews: filteredMCPServerViews,
      });
    const requestedSpaceIds = uniqModelIds([
      ...computedRequestedSpaceIds,
      ...additionalRequestedSpaceIds,
      ...salesforceSkill.requestedSpaceIds,
    ]);
    const instructions = replaceToolReferencesWithSkillReference({
      content: referencedSkill.instructions,
      salesforceMCPServerViewSIds,
      skill: salesforceSkill,
    });

    await referencedSkill.updateSkill(auth, {
      agentFacingDescription: referencedSkill.agentFacingDescription,
      attachedKnowledge,
      icon: referencedSkill.icon,
      instructions,
      instructionsHtml: convertMarkdownToBlockHtml(instructions),
      mcpServerViews: filteredMCPServerViews,
      name: referencedSkill.name,
      requestedSpaceIds,
      userFacingDescription: referencedSkill.userFacingDescription,
    });

    updatedSkillCount += 1;
  }

  logger.info(
    {
      referencedSkillCount: referencedSkills.length,
      salesforceSkillId: salesforceSkill.sId,
      updatedSkillCount,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    "Replaced Salesforce tool references with Salesforce skill references"
  );

  return updatedSkillCount;
}

async function backfillWorkspace(
  workspace: LightWorkspaceType,
  {
    execute,
    logger,
  }: {
    execute: boolean;
    logger: Logger;
  }
): Promise<void> {
  const {
    activeAgentMCPServerViewModelIds,
    agents: salesforceAgents,
    mcpServerConfigurationModelIds,
    mcpServerViewModelIds,
  } = await findLatestActiveSalesforceAgentUsage(workspace);
  if (mcpServerViewModelIds.length === 0) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const existingSkill = await fetchActiveSalesforceSkill(auth);
  const referencedSkills = await SkillResource.listByMCPServerViewIds(
    auth,
    mcpServerViewModelIds
  );
  const referencedSkillsToUpdate = referencedSkills.filter(
    (referencedSkill) => referencedSkill.id !== existingSkill?.id
  );
  const salesforceMCPServerViewModelIdSet = new Set(mcpServerViewModelIds);
  const referencedSkillMCPServerViewModelIds = referencedSkillsToUpdate.flatMap(
    (referencedSkill) =>
      referencedSkill.mcpServerViews
        .filter((view) => salesforceMCPServerViewModelIdSet.has(view.id))
        .map((view) => view.id)
  );
  const usedMCPServerViewModelIds = uniqModelIds([
    ...activeAgentMCPServerViewModelIds,
    ...referencedSkillMCPServerViewModelIds,
  ]);

  if (usedMCPServerViewModelIds.length === 0) {
    return;
  }

  const salesforceAgentModelIds = salesforceAgents.map((agent) => agent.id);

  logger.info(
    {
      agentIdsToLink: salesforceAgentModelIds.length,
      salesforceAgentCount: salesforceAgents.length,
      salesforceAgents: salesforceAgents.map((agent) => ({
        agentId: agent.sId,
        agentName: agent.name,
        version: agent.version,
      })),
      mcpServerConfigurationsToRemove: mcpServerConfigurationModelIds.length,
      mcpServerViewsToAttach: usedMCPServerViewModelIds.length,
      referencedSkillCount: referencedSkillsToUpdate.length,
      referencedSkills: referencedSkillsToUpdate.map((skill) => ({
        skillId: skill.sId,
        skillName: skill.name,
      })),
      skillExists: existingSkill !== null,
      workspaceId: workspace.sId,
    },
    execute
      ? "Backfilling Salesforce skill for workspace"
      : "Would backfill Salesforce skill for workspace"
  );

  if (!execute) {
    return;
  }

  const mcpServerViews = await fetchSalesforceMCPServerViews({
    auth,
    mcpServerViewModelIds: usedMCPServerViewModelIds,
    workspace,
  });

  let skill = existingSkill;
  if (!skill) {
    skill = await createSalesforceSkill({
      auth,
      mcpServerViews,
    });

    // Existing agent and skill editors are the best default editors for the generated skill.
    await addAgentEditorsToSkill(auth, {
      agentConfigurationModelIds: salesforceAgentModelIds,
      referencedSkillModelIds: referencedSkillsToUpdate.map(
        (referencedSkill) => referencedSkill.id
      ),
      logger,
      skill,
    });
  } else {
    const missingMCPServerViewModelIds =
      getMissingSalesforceMCPServerViewModelIds({
        mcpServerViewModelIds: usedMCPServerViewModelIds,
        skill,
      });

    if (missingMCPServerViewModelIds.length > 0) {
      throw new Error(
        `Existing skill "${SALESFORCE_SKILL_NAME}" in workspace ${workspace.sId} is missing Salesforce MCP server views: ${missingMCPServerViewModelIds.join(
          ", "
        )}.`
      );
    }
  }

  const updatedReferencedSkillCount =
    await replaceSalesforceToolWithSkillInReferencedSkills(auth, {
      logger,
      mcpServerViews,
      referencedSkills: referencedSkillsToUpdate,
      salesforceSkill: skill,
    });

  const agentModelIdsToLink = await getAgentModelIdsMissingSkill({
    agentConfigurationModelIds: salesforceAgentModelIds,
    skill,
    workspace,
  });

  if (agentModelIdsToLink.length > 0) {
    await AgentSkillModel.bulkCreate(
      agentModelIdsToLink.map((agentConfigurationModelId) => ({
        agentConfigurationId: agentConfigurationModelId,
        customSkillId: skill.id,
        globalSkillId: null,
        workspaceId: workspace.id,
      }))
    );
  }

  const removedMcpServerConfigurationCount =
    await AgentMCPServerConfigurationModel.destroy({
      where: {
        workspaceId: workspace.id,
        id: { [Op.in]: mcpServerConfigurationModelIds },
      },
    });

  logger.info(
    {
      agentIdsLinked: agentModelIdsToLink.length,
      mcpServerConfigurationsRemoved: removedMcpServerConfigurationCount,
      mcpServerViewsAttached: mcpServerViews.length,
      referencedSkillsUpdated: updatedReferencedSkillCount,
      skillId: skill.sId,
      workspaceId: workspace.sId,
    },
    "Backfilled Salesforce skill and removed Salesforce tool references for workspace"
  );
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "Workspace to process. Omit to scan all workspaces.",
      type: "string" as const,
    },
  },
  async ({ execute, workspaceId }, logger) => {
    logger.info(
      {
        concurrency: WORKSPACE_CONCURRENCY,
        execute,
        workspaceId: workspaceId ?? "all",
      },
      execute
        ? "Starting Salesforce skill backfill"
        : "Starting Salesforce skill backfill dry-run"
    );

    await runOnAllWorkspaces(
      async (workspace) =>
        backfillWorkspace(workspace, {
          execute,
          logger,
        }),
      {
        concurrency: WORKSPACE_CONCURRENCY,
        wId: workspaceId,
      }
    );

    logger.info(
      {
        execute,
        workspaceId: workspaceId ?? "all",
      },
      "Finished Salesforce skill backfill"
    );
  }
);
