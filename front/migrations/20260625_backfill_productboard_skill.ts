import {
  type InternalMCPServerNameType,
  matchesInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
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

type GuidanceSkillBackfillConfig = {
  agentFacingDescription: string;
  attachMCPServerViewsToSkill: boolean;
  icon: string;
  instructions: string;
  internalMCPServerName: InternalMCPServerNameType;
  label: string;
  replaceToolReferencesInSkills: boolean;
  skillName: string;
  userFacingDescription: string;
};

const GUIDANCE_SKILL_BACKFILL_CONFIGS: GuidanceSkillBackfillConfig[] = [
  {
    agentFacingDescription: PRODUCTBOARD_SKILL_AGENT_DESCRIPTION,
    attachMCPServerViewsToSkill: false,
    icon: PRODUCTBOARD_SKILL_ICON,
    instructions: PRODUCTBOARD_SKILL_INSTRUCTIONS,
    internalMCPServerName: "productboard",
    label: "Productboard",
    replaceToolReferencesInSkills: true,
    skillName: PRODUCTBOARD_SKILL_NAME,
    userFacingDescription: PRODUCTBOARD_SKILL_USER_DESCRIPTION,
  },
  {
    agentFacingDescription: SALESFORCE_SKILL_AGENT_DESCRIPTION,
    attachMCPServerViewsToSkill: true,
    icon: SALESFORCE_SKILL_ICON,
    instructions: SALESFORCE_SKILL_INSTRUCTIONS,
    internalMCPServerName: "salesforce",
    label: "Salesforce",
    replaceToolReferencesInSkills: true,
    skillName: SALESFORCE_SKILL_NAME,
    userFacingDescription: SALESFORCE_SKILL_USER_DESCRIPTION,
  },
];

interface ActiveMCPServerUsage {
  activeAgentMCPServerViewModelIds: ModelId[];
  agents: AgentConfigurationModel[];
  mcpServerConfigurationModelIds: ModelId[];
  mcpServerViewModelIds: ModelId[];
}

async function findLatestActiveMCPServerUsage(
  config: GuidanceSkillBackfillConfig,
  workspace: LightWorkspaceType
): Promise<ActiveMCPServerUsage> {
  const mcpServerViews = await MCPServerViewModel.findAll({
    where: {
      workspaceId: workspace.id,
      serverType: "internal",
      internalMCPServerId: { [Op.ne]: null },
    },
  });
  const mcpServerViewModelIds = mcpServerViews
    .filter((view) =>
      matchesInternalMCPServerName(
        view.internalMCPServerId,
        config.internalMCPServerName
      )
    )
    .map((view) => view.id);

  if (mcpServerViewModelIds.length === 0) {
    return {
      activeAgentMCPServerViewModelIds: [],
      agents: [],
      mcpServerConfigurationModelIds: [],
      mcpServerViewModelIds: [],
    };
  }

  const mcpServerConfigurations =
    await AgentMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        mcpServerViewId: { [Op.in]: mcpServerViewModelIds },
      },
    });
  const agentConfigurationModelIds = new Set(
    mcpServerConfigurations.map((mcpConfig) => mcpConfig.agentConfigurationId)
  );

  if (agentConfigurationModelIds.size === 0) {
    return {
      activeAgentMCPServerViewModelIds: [],
      agents: [],
      mcpServerConfigurationModelIds: [],
      mcpServerViewModelIds,
    };
  }

  const agentConfigurations = await AgentConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      id: [...agentConfigurationModelIds],
      status: "active",
    },
  });
  const activeAgentConfigurationModelIds = new Set(
    agentConfigurations.map((agent) => agent.id)
  );
  const activeMCPServerConfigurations = mcpServerConfigurations.filter(
    (mcpConfig) =>
      activeAgentConfigurationModelIds.has(mcpConfig.agentConfigurationId)
  );

  return {
    activeAgentMCPServerViewModelIds: [
      ...new Set(
        activeMCPServerConfigurations.map(
          (mcpConfig) => mcpConfig.mcpServerViewId
        )
      ),
    ],
    agents: agentConfigurations.sort((a, b) => a.name.localeCompare(b.name)),
    mcpServerConfigurationModelIds: activeMCPServerConfigurations.map(
      (mcpConfig) => mcpConfig.id
    ),
    mcpServerViewModelIds,
  };
}

async function fetchActiveSkill(
  config: GuidanceSkillBackfillConfig,
  auth: Authenticator
): Promise<SkillResource | null> {
  const owner = auth.getNonNullableWorkspace();

  const skillModel = await SkillConfigurationModel.findOne({
    where: {
      workspaceId: owner.id,
      name: config.skillName,
      status: "active",
    },
  });

  if (!skillModel) {
    return null;
  }

  const skill = await SkillResource.fetchByModelIdWithAuth(auth, skillModel.id);
  if (!skill) {
    throw new Error(
      `Failed to fetch existing skill "${config.skillName}" in workspace ${owner.sId}.`
    );
  }

  return skill;
}

async function fetchMCPServerViews({
  auth,
  config,
  mcpServerViewModelIds,
  workspace,
}: {
  auth: Authenticator;
  config: GuidanceSkillBackfillConfig;
  mcpServerViewModelIds: ModelId[];
  workspace: LightWorkspaceType;
}): Promise<MCPServerViewResource[]> {
  if (mcpServerViewModelIds.length === 0) {
    return [];
  }

  const mcpServerViews = await MCPServerViewResource.fetchByModelIds(
    auth,
    mcpServerViewModelIds
  );

  if (mcpServerViews.length !== mcpServerViewModelIds.length) {
    throw new Error(
      `Could not fetch all ${config.label} MCP server views in workspace ${workspace.sId}.`
    );
  }

  return mcpServerViews;
}

async function createGuidanceSkill(
  config: GuidanceSkillBackfillConfig,
  auth: Authenticator,
  mcpServerViews: MCPServerViewResource[]
): Promise<SkillResource> {
  const attachedMCPServerViews = config.attachMCPServerViewsToSkill
    ? mcpServerViews
    : [];
  const requestedSpaceIds = config.attachMCPServerViewsToSkill
    ? await SkillResource.computeRequestedSpaceIds(auth, {
        attachedKnowledge: [],
        mcpServerViews: attachedMCPServerViews,
      })
    : [];

  return SkillResource.makeNew(
    auth,
    {
      agentFacingDescription: config.agentFacingDescription,
      editedBy: null,
      icon: config.icon,
      instructions: config.instructions,
      instructionsHtml: convertMarkdownToBlockHtml(config.instructions),
      isDefault: false,
      name: config.skillName,
      reinforcement: "on",
      requestedSpaceIds,
      source: null,
      sourceMetadata: null,
      status: "active",
      userFacingDescription: config.userFacingDescription,
    },
    {
      addCurrentUserAsEditor: false,
      attachedKnowledge: [],
      mcpServerViews: attachedMCPServerViews,
    }
  );
}

async function addEditorsToSkill(
  auth: Authenticator,
  {
    agentConfigurationModelIds,
    config,
    logger,
    referencedSkillModelIds,
    skill,
  }: {
    agentConfigurationModelIds: ModelId[];
    config: GuidanceSkillBackfillConfig;
    logger: Logger;
    referencedSkillModelIds: ModelId[];
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
      `No editor groups found for ${config.label} agents or skills`
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
      `Could not find editor group for skill "${config.skillName}" in workspace ${owner.sId}.`
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
      `Could not fetch editor group for skill "${config.skillName}" in workspace ${owner.sId}.`
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
      `No editor members found for ${config.label} agents or skills`
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
      `${config.label} skill editors already up to date`
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
    `Added ${config.label} skill editors`
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

function getMissingMCPServerViewModelIds({
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

function uniqModelIds(modelIds: ModelId[]): ModelId[] {
  return [...new Set(modelIds)];
}

function replaceToolReferencesWithSkillReference({
  content,
  mcpServerViewSIds,
  skill,
}: {
  content: string;
  mcpServerViewSIds: Set<string>;
  skill: SkillResource;
}): string {
  const skillTag = serializeSkillTag({
    icon: skill.icon,
    id: skill.sId,
    name: skill.name,
  });

  return content.replace(TOOL_TAG_REGEX, (tag) => {
    const tool = parseToolTag(tag);
    if (!tool || !mcpServerViewSIds.has(tool.id)) {
      return tag;
    }

    return skillTag;
  });
}

async function replaceToolReferencesWithSkillInReferencedSkills(
  auth: Authenticator,
  {
    config,
    logger,
    mcpServerViews,
    referencedSkills,
    skill,
  }: {
    config: GuidanceSkillBackfillConfig;
    logger: Logger;
    mcpServerViews: MCPServerViewResource[];
    referencedSkills: SkillResource[];
    skill: SkillResource;
  }
): Promise<number> {
  if (!config.replaceToolReferencesInSkills || mcpServerViews.length === 0) {
    return 0;
  }

  const mcpServerViewSIds = new Set(mcpServerViews.map((view) => view.sId));
  let updatedSkillCount = 0;

  for (const referencedSkill of referencedSkills) {
    if (referencedSkill.id === skill.id) {
      continue;
    }

    const instructions = replaceToolReferencesWithSkillReference({
      content: referencedSkill.instructions,
      mcpServerViewSIds,
      skill,
    });
    if (instructions === referencedSkill.instructions) {
      continue;
    }

    const attachedKnowledge = await referencedSkill.getAttachedKnowledge(auth);

    await referencedSkill.updateSkill(auth, {
      agentFacingDescription: referencedSkill.agentFacingDescription,
      attachedKnowledge,
      icon: referencedSkill.icon,
      instructions,
      instructionsHtml: convertMarkdownToBlockHtml(instructions),
      mcpServerViews: referencedSkill.mcpServerViews,
      name: referencedSkill.name,
      requestedSpaceIds: referencedSkill.requestedSpaceIds,
      userFacingDescription: referencedSkill.userFacingDescription,
    });

    updatedSkillCount += 1;
  }

  logger.info(
    {
      referencedSkillCount: referencedSkills.length,
      skillId: skill.sId,
      updatedSkillCount,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    `Replaced ${config.label} tool references with skill references`
  );

  return updatedSkillCount;
}

async function backfillWorkspaceForConfig(
  config: GuidanceSkillBackfillConfig,
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
    agents,
    mcpServerConfigurationModelIds,
    mcpServerViewModelIds,
  } = await findLatestActiveMCPServerUsage(config, workspace);
  if (mcpServerViewModelIds.length === 0) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const existingSkill = await fetchActiveSkill(config, auth);
  const referencedSkills = config.replaceToolReferencesInSkills
    ? await SkillResource.listByMCPServerViewIds(auth, mcpServerViewModelIds)
    : [];
  const referencedSkillsToUpdate = referencedSkills.filter(
    (referencedSkill) => referencedSkill.id !== existingSkill?.id
  );
  const mcpServerViewModelIdSet = new Set(mcpServerViewModelIds);
  const referencedSkillMCPServerViewModelIds = referencedSkillsToUpdate.flatMap(
    (referencedSkill) =>
      referencedSkill.mcpServerViews
        .filter((view) => mcpServerViewModelIdSet.has(view.id))
        .map((view) => view.id)
  );
  const mcpServerViewModelIdsToFetch = uniqModelIds([
    ...(config.attachMCPServerViewsToSkill
      ? activeAgentMCPServerViewModelIds
      : []),
    ...referencedSkillMCPServerViewModelIds,
  ]);

  if (agents.length === 0 && referencedSkillsToUpdate.length === 0) {
    return;
  }

  const agentModelIds = agents.map((agent) => agent.id);

  logger.info(
    {
      agentIdsToLink: agentModelIds.length,
      agents: agents.map((agent) => ({
        agentId: agent.sId,
        agentName: agent.name,
        version: agent.version,
      })),
      label: config.label,
      mcpServerConfigurationsToRemove: mcpServerConfigurationModelIds.length,
      mcpServerViewsToFetch: mcpServerViewModelIdsToFetch.length,
      referencedSkillCount: referencedSkillsToUpdate.length,
      referencedSkills: referencedSkillsToUpdate.map((skill) => ({
        skillId: skill.sId,
        skillName: skill.name,
      })),
      skillExists: existingSkill !== null,
      workspaceId: workspace.sId,
    },
    execute
      ? `Backfilling ${config.label} skill for workspace`
      : `Would backfill ${config.label} skill for workspace`
  );

  if (!execute) {
    return;
  }

  const mcpServerViews = await fetchMCPServerViews({
    auth,
    config,
    mcpServerViewModelIds: mcpServerViewModelIdsToFetch,
    workspace,
  });

  let skill = existingSkill;
  if (!skill) {
    skill = await createGuidanceSkill(config, auth, mcpServerViews);

    // Existing agent and skill editors are the best default editors for the generated skill.
    await addEditorsToSkill(auth, {
      agentConfigurationModelIds: agentModelIds,
      config,
      logger,
      referencedSkillModelIds: referencedSkillsToUpdate.map(
        (referencedSkill) => referencedSkill.id
      ),
      skill,
    });
  } else if (config.attachMCPServerViewsToSkill) {
    const missingMCPServerViewModelIds = getMissingMCPServerViewModelIds({
      mcpServerViewModelIds: mcpServerViewModelIdsToFetch,
      skill,
    });

    if (missingMCPServerViewModelIds.length > 0) {
      throw new Error(
        `Existing skill "${config.skillName}" in workspace ${workspace.sId} is missing ${config.label} MCP server views: ${missingMCPServerViewModelIds.join(
          ", "
        )}.`
      );
    }
  }

  const updatedReferencedSkillCount =
    await replaceToolReferencesWithSkillInReferencedSkills(auth, {
      config,
      logger,
      mcpServerViews,
      referencedSkills: referencedSkillsToUpdate,
      skill,
    });

  const agentModelIdsToLink = await getAgentModelIdsMissingSkill({
    agentConfigurationModelIds: agentModelIds,
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

  const removedMCPServerConfigurationCount =
    mcpServerConfigurationModelIds.length > 0
      ? await AgentMCPServerConfigurationModel.destroy({
          where: {
            workspaceId: workspace.id,
            id: { [Op.in]: mcpServerConfigurationModelIds },
          },
        })
      : 0;

  logger.info(
    {
      agentIdsLinked: agentModelIdsToLink.length,
      label: config.label,
      mcpServerConfigurationsRemoved: removedMCPServerConfigurationCount,
      referencedSkillsUpdated: updatedReferencedSkillCount,
      skillId: skill.sId,
      workspaceId: workspace.sId,
    },
    `Backfilled ${config.label} skill for workspace`
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
        ? "Starting Productboard and Salesforce skill backfill"
        : "Starting Productboard and Salesforce skill backfill dry-run"
    );

    await runOnAllWorkspaces(
      async (workspace) => {
        for (const config of GUIDANCE_SKILL_BACKFILL_CONFIGS) {
          await backfillWorkspaceForConfig(config, workspace, {
            execute,
            logger,
          });
        }
      },
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
      "Finished Productboard and Salesforce skill backfill"
    );
  }
);
