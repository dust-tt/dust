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

const PRODUCTBOARD_SKILL_NAME = "Work with Productboard";
const PRODUCTBOARD_SKILL_ICON = "ProductboardLogo";
const PRODUCTBOARD_SKILL_USER_DESCRIPTION =
  "Helps agents create, update, and query Productboard content using the right workspace setup.";
const PRODUCTBOARD_SKILL_AGENT_DESCRIPTION =
  "Use this skill whenever you use Productboard tools to create, update, query, or inspect Productboard notes, entities, relationships, or configuration.";

const PRODUCTBOARD_SKILL_INSTRUCTIONS = `
**ALWAYS call \`get_configuration\` BEFORE creating or updating any entity or note.** Productboard has a flexible, workspace-specific data model where available fields, types, requirements, and allowed operations vary by workspace.

Productboard uses a configuration-driven API. Always start by calling get_configuration to understand available fields.

### Entity Types Reference

**Notes:** Use \`entity_type='textNote'\` or \`entity_type='conversationNote'\`
**Entities:** Use \`entity_type='product'\`, \`'component'\`, \`'feature'\`, \`'subfeature'\`, \`'initiative'\`, \`'objective'\`, \`'keyResult'\`, \`'release'\`, \`'releaseGroup'\`, \`'company'\`, or \`'user'\`

### Required Workflow for Creating

1. Call \`get_configuration\` with the appropriate \`entity_type\`
2. Review the configuration response to identify:
   - Required fields (marked with \`required: true\`)
   - Optional fields you want to include
   - Field types and formats (see Field Value Types section)
   - Allowed operations for each field
3. Build the \`fields\` object using exact field names and types from the configuration
4. Optionally build the \`relationships\` array to link to other entities/customers
5. Call \`create_note\` or \`create_entity\` with the properly formatted data

### Required Workflow for Updating

1. Call \`get_configuration\` with the appropriate \`entity_type\`
2. Review the configuration response to identify:
   - Which fields can be updated (check \`lifecycle.update\` and \`lifecycle.patch\` properties)
   - Allowed operations for each field (set, clear, addItems, removeItems)
   - Field types and formats for values
3. Choose your update method:
   - **Field updates:** Use \`fields\` object to replace entire field values
   - **Patch operations:** Use \`patch\` array for granular updates with operations: \`set\` (replace value), \`clear\` (erase value), \`addItems\` (add to list), \`removeItems\` (remove from list)
   - **Operation rules:** Cannot combine set/clear with addItems/removeItems on same field; cannot combine set and clear on same field; can combine addItems and removeItems together
4. Build your update payload using exact field names and types from the configuration
5. Call \`update_note\` or \`update_entity\` with the properly formatted data

**Note:** The specific fields that support patch operations vary by workspace. Always check the configuration response for available operations.

---

## Pagination

The API uses cursor-based pagination for list endpoints. To fetch multiple pages:

1. Call the tool (e.g., \`query_notes\`) without \`page_cursor\` for the first page
2. If the response shows "More results available" with a \`pageCursor\`, call the tool again with \`page_cursor\` set to that value
3. Repeat until no \`pageCursor\` is returned

**Important:** Treat the \`pageCursor\` as an opaque string - do not parse or modify it.

---

The Productboard REST API v2 uses types to represent structured data in a more organized way. Understanding these types is essential for effectively working with the API since they are frequently used in the configuration endpoints.

## Field Value Types

Types are referenced from the configuration endpoints. After calling these endpoints, a response will include a \`data\` object that contains many \`fields\`. Each of these \`fields\` will contain a \`schema\` key and value (e.g., \`RichTextFieldValue\`, \`TextFieldValue\`, \`StatusFieldValue\`).

For detailed information about field value types, see: https://developer.productboard.com/v2.0.0/reference/field-value-types

### Basic Types

The following map to strings:
- \`UUIDFieldValue\`
- \`TextFieldValue\`
- \`RichTextFieldValue\` - HTML content (e.g., \`"<p>This is <b>rich</b> text.</p>"\`)
- \`DateFieldValue\` - ISO 8601 format without time (e.g., "2023-10-01")
- \`DateTimeFieldValue\` - ISO 8601 format (e.g., "2023-10-01T12:00:00Z")
- \`URLFieldValue\`
- \`NameFieldValue\`

The following map to numbers:
- \`NumberFieldValue\` - integers or floats, including negative numbers

The following map to booleans:
- \`BooleanFieldValue\`

The following map to enumerations:
- \`GranularityFieldValue\` - year, quarter, month, day

### Complex Types

**Status and state fields:**
- Use the values returned by \`get_configuration\`.
- Prefer assigning by \`id\` when available; use \`name\` only when the configuration supports it and the exact name is known.
- Do not invent status or state names.

**Member Fields:**
- \`MemberFieldValue\` - has \`id\` (UUID) and \`email\` (NameFieldValue)
- \`MemberFieldAssign\` - can be \`MemberAssignById\` (with \`id\`) or \`MemberAssignByEmail\` (with \`email\`)

**Teams Fields:**
- \`TeamFieldValue\` - has \`id\` (UUID) and \`name\` (NameFieldValue)
- \`TeamsFieldValue\` - array of \`TeamFieldValue\` objects
- \`TeamFieldAssign\` - can be \`TeamAssignById\` (with \`id\`) or \`TeamAssignByName\` (with \`name\`)
- \`TeamsFieldAssign\` - array of \`TeamFieldAssign\` objects

**Choice Fields:**
- \`SingleSelectFieldValue\` - has \`id\`, \`name\`, and \`color\`
- \`SingleSelectFieldAssign\` - can be \`SingleSelectFieldAssignById\` (with \`id\`) or \`SingleSelectFieldAssignByName\` (with \`name\`)
- \`MultiSelectFieldValue\` - array of \`SingleSelectFieldValue\` objects
- \`MultiSelectFieldAssign\` - array of \`SingleSelectFieldAssign\` objects

**Time Fields:**
- \`TimeframeFieldValue\` - has \`startDate\` (DateFieldValue), \`endDate\` (DateFieldValue), and \`granularity\` (GranularityFieldValue)

**Health Fields:**
- Use only statuses supported by the configuration. When supported, common values are \`notSet\`, \`onTrack\`, \`atRisk\`, and \`offTrack\`.
- Include a \`comment\` when changing health if the update would otherwise be ambiguous.

**Progress Fields:**
- \`ProgressFieldValue\` - has \`startValue\`, \`targetValue\`, \`currentValue\` (all floats)
- \`WorkProgressFieldValue\` - has \`value\` (integer 0-100) and \`mode\` (manual/statusBased/calculated)

### FieldValue vs FieldAssign

- **FieldValue** types are used when retrieving data from the API (representing current field values)
- **FieldAssign** types are used when sending data to the API (representing how to set/update field values)

When a field has a \`FieldAssign\` type, you can often specify the value by \`id\` or by \`name\`. We recommend using IDs when possible, as names can change over time.

### ConversationNotePart

For conversation-type notes, the \`content\` field uses an array of \`ConversationNotePart\` objects:

\`\`\`typescript
interface ConversationNotePart {
  externalId: string;        // REQUIRED - External identifier for this message
  authorType: string;        // REQUIRED - Type of author (e.g., "customer", "agent")
  content: string;           // REQUIRED - HTML content of the message
  timestamp: string;         // REQUIRED - ISO 8601 timestamp (e.g., "2026-01-12T10:00:00Z")
  authorName?: string;       // OPTIONAL - Name of the message author
  id?: string;               // OPTIONAL - Internal Productboard ID (read-only, assigned by API)
}
\`\`\`


**Update Examples:**
- Field update: \`{fields: {name: "New name", tags: [{name: "tag1"}]}}\`
- Patch set: \`{patch: [{op: "set", path: "name", value: "New name"}]}\`
- Patch addItems: \`{patch: [{op: "addItems", path: "tags", value: [{name: "new-tag"}]}]}\`
- Patch clear: \`{patch: [{op: "clear", path: "owner"}]}\`
`;

async function findLatestActiveProductboardAgents(
  workspace: LightWorkspaceType
): Promise<{
  productboardAgents: AgentConfigurationModel[];
  productboardMCPServerConfigurationModelIds: ModelId[];
}> {
  const productboardMCPServerViews = await MCPServerViewModel.findAll({
    where: {
      workspaceId: workspace.id,
      serverType: "internal",
      internalMCPServerId: { [Op.ne]: null },
    },
  });
  const productboardMCPServerViewModelIds = productboardMCPServerViews
    .filter((view) =>
      matchesInternalMCPServerName(view.internalMCPServerId, "productboard")
    )
    .map((view) => view.id);

  if (productboardMCPServerViewModelIds.length === 0) {
    return {
      productboardAgents: [],
      productboardMCPServerConfigurationModelIds: [],
    };
  }

  const productboardMCPServerConfigurations =
    await AgentMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        mcpServerViewId: { [Op.in]: productboardMCPServerViewModelIds },
      },
    });
  const productboardAgentConfigurationModelIds = new Set(
    productboardMCPServerConfigurations.map(
      (config) => config.agentConfigurationId
    )
  );

  if (productboardAgentConfigurationModelIds.size === 0) {
    return {
      productboardAgents: [],
      productboardMCPServerConfigurationModelIds: [],
    };
  }

  const productboardAgentConfigurations = await AgentConfigurationModel.findAll(
    {
      where: {
        workspaceId: workspace.id,
        id: [...productboardAgentConfigurationModelIds],
        status: "active",
      },
    }
  );
  const productboardActiveAgentConfigurationModelIds = new Set(
    productboardAgentConfigurations.map((agent) => agent.id)
  );

  return {
    productboardAgents: productboardAgentConfigurations.sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    productboardMCPServerConfigurationModelIds:
      productboardMCPServerConfigurations
        .filter((config) =>
          productboardActiveAgentConfigurationModelIds.has(
            config.agentConfigurationId
          )
        )
        .map((config) => config.id),
  };
}

async function fetchActiveProductboardSkill(
  auth: Authenticator
): Promise<SkillResource | null> {
  const owner = auth.getNonNullableWorkspace();

  const skillModel = await SkillConfigurationModel.findOne({
    where: {
      workspaceId: owner.id,
      name: PRODUCTBOARD_SKILL_NAME,
      status: "active",
    },
  });

  if (!skillModel) {
    return null;
  }

  const skill = await SkillResource.fetchByModelIdWithAuth(auth, skillModel.id);
  if (!skill) {
    throw new Error(
      `Failed to fetch existing skill "${PRODUCTBOARD_SKILL_NAME}" in workspace ${owner.sId}.`
    );
  }

  return skill;
}

async function createProductboardSkill(
  auth: Authenticator
): Promise<SkillResource> {
  return SkillResource.makeNew(
    auth,
    {
      agentFacingDescription: PRODUCTBOARD_SKILL_AGENT_DESCRIPTION,
      editedBy: null,
      icon: PRODUCTBOARD_SKILL_ICON,
      instructions: PRODUCTBOARD_SKILL_INSTRUCTIONS,
      instructionsHtml: convertMarkdownToBlockHtml(
        PRODUCTBOARD_SKILL_INSTRUCTIONS
      ),
      isDefault: false,
      name: PRODUCTBOARD_SKILL_NAME,
      reinforcement: "on",
      // The MCP server views are all on the global space in practice.
      requestedSpaceIds: [],
      source: null,
      sourceMetadata: null,
      status: "active",
      userFacingDescription: PRODUCTBOARD_SKILL_USER_DESCRIPTION,
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
      "No agent editor groups found for Productboard agents"
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
      `Could not find editor group for skill "${PRODUCTBOARD_SKILL_NAME}" in workspace ${owner.sId}.`
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
      `Could not fetch editor group for skill "${PRODUCTBOARD_SKILL_NAME}" in workspace ${owner.sId}.`
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
      "No agent editor members found for Productboard agents"
    );
    return;
  }

  const users = await UserResource.fetchByModelIds(agentEditorUserModelIds);
  const { memberships } = await MembershipResource.getActiveMemberships({
    users,
    workspace: auth.getNonNullableWorkspace(),
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
      "Productboard skill editors already up to date"
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
    "Added Productboard skill editors"
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
  const { productboardAgents, productboardMCPServerConfigurationModelIds } =
    await findLatestActiveProductboardAgents(workspace);
  if (productboardAgents.length === 0) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const existingSkill = await fetchActiveProductboardSkill(auth);

  const productboardAgentModelIds = productboardAgents.map((agent) => agent.id);

  logger.info(
    {
      agentIdsToLink: productboardAgentModelIds.length,
      productboardAgentCount: productboardAgents.length,
      productboardAgents: productboardAgents.map((agent) => ({
        agentId: agent.sId,
        agentName: agent.name,
        version: agent.version,
      })),
      productboardMCPServerConfigurationCount:
        productboardMCPServerConfigurationModelIds.length,
      skillExists: existingSkill !== null,
      workspaceId: workspace.sId,
    },
    execute
      ? "Backfilling Productboard skill for workspace"
      : "Would backfill Productboard skill for workspace"
  );

  if (!execute) {
    return;
  }

  let skill = existingSkill;
  if (!skill) {
    skill = await createProductboardSkill(auth);

    // We add some editors to the skill to make sure we're not creating a skill with 0 editor.
    // We take the agent editors as they are the most prone to know about Productboard at their company.
    await addAgentEditorsToSkill(auth, {
      agentConfigurationModelIds: productboardAgentModelIds,
      logger,
      skill,
    });
  }

  await AgentSkillModel.bulkCreate(
    productboardAgentModelIds.map((agentConfigurationModelId) => ({
      agentConfigurationId: agentConfigurationModelId,
      customSkillId: skill.id,
      globalSkillId: null,
      workspaceId: workspace.id,
    }))
  );

  await AgentMCPServerConfigurationModel.destroy({
    where: {
      workspaceId: workspace.id,
      id: { [Op.in]: productboardMCPServerConfigurationModelIds },
    },
  });

  logger.info(
    {
      agentIdsToLink: productboardAgentModelIds.length,
      productboardMCPServerConfigurationsRemoved:
        productboardMCPServerConfigurationModelIds.length,
      skillId: skill.sId,
      workspaceId: workspace.sId,
    },
    "Backfilled Productboard skill for workspace"
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
        ? "Starting Productboard skill backfill"
        : "Starting Productboard skill backfill dry-run"
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
      "Finished Productboard skill backfill"
    );
  }
);
