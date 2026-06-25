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
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

const WORKSPACE_CONCURRENCY = 16;

const SALESFORCE_SKILL_NAME = "Working with Salesforce";
const SALESFORCE_SKILL_ICON = "SalesforceLogo";
const SALESFORCE_SKILL_USER_DESCRIPTION =
  "Helps agents inspect Salesforce metadata and write reliable SOQL read queries.";
const SALESFORCE_SKILL_AGENT_DESCRIPTION =
  "Use this skill whenever you use Salesforce tools to inspect objects, describe metadata, or execute SOQL read queries.";

const SALESFORCE_SKILL_INSTRUCTIONS = `You have access to the following tools: execute_read_query, list_objects, and describe_object.

# General Workflow for Salesforce Data:
1.  **List Objects (Optional):** If you don't know the exact name of an object, use \`list_objects\` to find it.
2.  **Describe Object:** Use \`describe_object\` with the specific object name (e.g., \`Account\`, \`MyCustomObject__c\`) to get its detailed metadata. This will show you all available fields, their exact names, data types, and information about relationships (child relationships are particularly important for subqueries).
3.  **Execute Read Query:** Use \`execute_read_query\` to retrieve data using SOQL. Construct your SOQL queries based on the information obtained from \`describe_object\` to ensure you are using correct field and relationship names.

# execute_read_query
You can use it to execute SOQL read queries on Salesforce. Queries can be used to retrieve or discover data, never to write data.

**Best Practices for Querying:**
1.  **Discover Object Structure First:** ALWAYS use \`describe_object(objectName='YourObjectName')\` to understand an object's fields and relationships before writing complex queries. Alternatively, for a quick field list directly in a query, use \`FIELDS()\` (e.g., \`SELECT FIELDS(ALL) FROM Account LIMIT 1\`). This helps prevent errors from misspelled or non-existent field/relationship names. The \`FIELDS()\` function requires a \`LIMIT\` clause, with a maximum of 200.
2.  **Verify Field and Relationship Names:** If you encounter "No such column" or "Didn't understand relationship" errors, use \`describe_object\` for the relevant object(s) to confirm the exact names and their availability. For example, child relationship names used in subqueries (e.g., \`(SELECT Name FROM Contacts)\` or \`(SELECT Name FROM MyCustomChildren__r)\`) can be found in the output of \`describe_object\`.

**Custom Objects, Fields, and Relationships:**
-   **Custom Objects & Fields:** When referencing custom objects or fields, append \`__c\` to their names (e.g., \`MyCustomField__c\`, \`MyCustomObject__c\`). Confirm these names using \`describe_object\`.
-   **Custom Relationships:** When referencing custom relationships (typically in parent-to-child subqueries), append \`__r\` to the relationship name (e.g., \`(SELECT Name FROM MyCustomRelatedObjects__r)\`). \`describe_object\` will list these child relationship names.

**FIELDS() Keyword Details (Alternative to describe_object for quick field listing in query):**
Use \`FIELDS(ALL)\`, \`FIELDS(CUSTOM)\`, or \`FIELDS(STANDARD)\` in your \`SELECT\` statement to retrieve groups of fields.
-   \`FIELDS(ALL)\`: Selects all fields.
-   \`FIELDS(CUSTOM)\`: Selects all custom fields.
-   \`FIELDS(STANDARD)\`: Selects all standard fields.
Remember to include \`LIMIT\` (max 200) when using \`FIELDS()\`.

**Relationships in Queries (Confirm names with describe_object):**
-   **Child-to-Parent:** Use dot notation. E.g., \`SELECT Account.Name, LastName FROM Contact\`.
-   **Parent-to-Child (Subqueries):** Use a subquery. Confirm relationship name (e.g., \`Contacts\` or \`MyCustomChildren__r\`) via \`describe_object\`.
    -   Standard Relationship: \`SELECT Name, (SELECT FirstName, LastName FROM Contacts) FROM Account\`
    -   Custom Relationship: \`SELECT Name, (SELECT Name FROM MyCustomChildren__r) FROM Account\`

If errors persist after using \`describe_object\` and following these guidelines, the field, object, or relationship might genuinely not exist, or you may lack permissions.

# list_objects
You can use it to list the objects in Salesforce: standard and custom objects. Useful for finding object names if you're unsure.

# describe_object
Use this tool to get detailed metadata about a specific Salesforce object. Provide the object's API name (e.g., \`Account\`, \`Lead\`, \`MyCustomObject__c\`).
The output includes:
-   A list of all fields with their names, labels, types, and other properties.
-   Details about child relationships (useful for parent-to-child subqueries in SOQL), including the relationship name.
-   Information about record types.
-   Other object-level properties.
This is the most reliable way to discover the correct names for fields and relationships before writing an \`execute_read_query\`.
`;

interface ActiveSalesforceAgentUsage {
  agents: AgentConfigurationModel[];
  mcpServerConfigurationModelIds: ModelId[];
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
    return { agents: [], mcpServerConfigurationModelIds: [] };
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
    return { agents: [], mcpServerConfigurationModelIds: [] };
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

  return {
    agents: salesforceAgentConfigurations.sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    mcpServerConfigurationModelIds: mcpConfigurations
      .filter((config) =>
        activeAgentConfigurationModelIds.has(config.agentConfigurationId)
      )
      .map((config) => config.id),
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

async function createSalesforceSkill(
  auth: Authenticator
): Promise<SkillResource> {
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
      requestedSpaceIds: [],
      source: null,
      sourceMetadata: null,
      status: "active",
      userFacingDescription: SALESFORCE_SKILL_USER_DESCRIPTION,
    },
    {
      addCurrentUserAsEditor: false,
      attachedKnowledge: [],
      mcpServerViews: [],
    }
  );
}

async function addAgentEditorsToSkill(
  auth: Authenticator,
  {
    agentConfigurationModelIds,
    logger,
    skill,
  }: {
    agentConfigurationModelIds: ModelId[];
    logger: Logger;
    skill: SkillResource;
  }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  if (agentConfigurationModelIds.length === 0) {
    return;
  }

  const agentEditorLinks = await GroupAgentModel.findAll({
    where: {
      workspaceId: owner.id,
      agentConfigurationId: { [Op.in]: agentConfigurationModelIds },
    },
  });
  const agentEditorGroupModelIds = [
    ...new Set(agentEditorLinks.map((link) => link.groupId)),
  ];

  if (agentEditorGroupModelIds.length === 0) {
    logger.warn(
      { skillId: skill.sId, workspaceId: owner.sId },
      "No agent editor groups found for Salesforce agents"
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
    ...agentEditorGroupModelIds,
  ]);
  const groupByModelId = new Map(groups.map((group) => [group.id, group]));

  const skillEditorGroup = groupByModelId.get(skillEditorLink.groupId);
  if (!skillEditorGroup) {
    throw new Error(
      `Could not fetch editor group for skill "${SALESFORCE_SKILL_NAME}" in workspace ${owner.sId}.`
    );
  }
  const agentEditorGroups = agentEditorGroupModelIds
    .map((groupModelId) => groupByModelId.get(groupModelId) ?? null)
    .filter((group): group is GroupResource => group !== null);

  const activeAgentEditorMemberships =
    await GroupResource.getActiveMembershipsForGroups(auth, agentEditorGroups);
  const agentEditorUserModelIds = [
    ...new Set(Object.values(activeAgentEditorMemberships).flat()),
  ];

  if (agentEditorUserModelIds.length === 0) {
    logger.warn(
      { skillId: skill.sId, workspaceId: owner.sId },
      "No agent editor members found for Salesforce agents"
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
  const { agents: salesforceAgents, mcpServerConfigurationModelIds } =
    await findLatestActiveSalesforceAgentUsage(workspace);
  if (salesforceAgents.length === 0) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const existingSkill = await fetchActiveSalesforceSkill(auth);

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

  let skill = existingSkill;
  if (!skill) {
    skill = await createSalesforceSkill(auth);

    // Agent editors are the best default editors for the generated skill.
    await addAgentEditorsToSkill(auth, {
      agentConfigurationModelIds: salesforceAgentModelIds,
      logger,
      skill,
    });
  }

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
      skillId: skill.sId,
      workspaceId: workspace.sId,
    },
    "Backfilled Salesforce skill and removed Salesforce tool for workspace"
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
