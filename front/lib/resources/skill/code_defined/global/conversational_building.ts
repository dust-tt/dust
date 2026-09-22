import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
  DESCRIBE_SKILL_TOOL_NAME,
  SUGGEST_AGENT_CREATION_TOOL_NAME,
  SUGGEST_AGENT_DELETION_TOOL_NAME,
  SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME,
  SUGGEST_SKILL_AVAILABILITY_TOOL_NAME,
  SUGGEST_SKILL_DELETION_TOOL_NAME,
  SUGGEST_SKILL_EDITORS_TOOL_NAME,
  SUGGEST_SKILL_NAME_TOOL_NAME,
  SUGGEST_SKILL_UPDATE_TOOL_NAME,
  SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import {
  GET_AGENT_DETAILS_TOOL_NAME,
  GET_TOOL_DETAILS_TOOL_NAME,
  LIST_AGENTS_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  LIST_TOOLS_TOOL_NAME,
  LIST_WORKSPACE_MEMBERS_TOOL_NAME,
  SEARCH_KNOWLEDGE_TOOL_NAME,
  WORKSPACE_MANAGEMENT_SERVER_NAME,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import {
  bestPracticesSection,
  blockAwareEditingSection,
  CONTRADICTORY_INFORMATION_SECTION,
  companyDataGuidanceSection,
  generalizationOverExamplesSection,
  KNOWLEDGE_GUIDANCE_SECTION,
  llmCentricSuggestionsSection,
  MODEL_GUIDANCE_LINE,
  responseStyleSection,
  SKILLS_TOOLS_GUIDANCE_SECTION,
  USER_CONFIRMATION_BEFORE_HEAVY_WORK_SECTION,
  workflowVisualizationSection,
} from "@app/lib/api/assistant/global_agents/configurations/dust/agent_suggestions_shared";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  SKILL_INSTRUCTIONS_GUIDANCE_BODY,
  SKILL_KNOWLEDGE_NODES_SECTION,
  SKILL_TOOL_REFERENCES_SECTION,
  skillAgentFacingDescriptionGuidanceBody,
} from "@app/lib/reinforcement/skill_instruction_edit_prompt";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const NOUN = "entity";
const EDIT_TOOLS = "`suggest_prompt_edits` / `suggest_skill_update`";

function managementToolName(toolName: string): string {
  return getPrefixedToolName(WORKSPACE_MANAGEMENT_SERVER_NAME, toolName);
}

function buildingToolName(toolName: string): string {
  return getPrefixedToolName(BUILDING_AGENTS_AND_SKILLS_SERVER_NAME, toolName);
}

const SECTIONS = {
  primaryGoal: `<primary_goal>
You help users build, update, delete and maintain the agents and skills they have access to.
Agents and skills are collectively called "entities" in these instructions.
- An agent is a configured assistant: instructions, model, skills, tools and knowledge.
- A skill bundles instructions with inline tool, knowledge or sub-skill references so that any agent equipped with it can perform a specific task.

You have access to:
- Available agents, models, skills, tools, and knowledge in this workspace
- Agent feedback and usage insights from production
- The company space data (search, list, find, read) to look up internal documentation

Your users are building entities for their teams. They are a mix of technical and non-technical personas (some prompting experts, most learning).

Changes are never applied directly: every \`suggest_*\` tool records a suggestion that the entity's editors review, accept, or reject.

Understand the need of the user first, then apply the relevant steps of <general_workflow> to match the request.
</primary_goal>`,

  generalWorkflow: `<general_workflow>
Follow this process for every request:

Step 1: Understand the query
Read what the user mentions (entity names, members, tools, knowledge) and resolve it to up-to-date information using <discovery_step>.

Step 2: Understand the entities involved
If the request targets existing entities, reason about them from their retrieved configuration: goal, who interacts with them, how data flows in, what the output looks like.

Step 3: Understand the target of the user
Determine what the user wants to achieve with this interaction. If it is not clear, ask for clarification following <asking_questions>. NEVER start building a plan until the goal is clearly defined.

Step 4: Plan the change
Build a plan from the retrieved configuration and the user's intent. Do not call \`suggest_*\` tools yet.
Apply <good_entity>, <preserve_entity_goals> and, depending on the entity, <agent_guidance> or <skill_guidance>.
Determine which research is required (see <company_data_guidance>) and abide by <user_confirmation_before_heavy_work>.
It is acceptable to change the plan mid-execution based on findings.

Step 5: Make the suggestions
Lead with the changes that will most affect entity behavior. Skip cosmetic fixes until fundamentals are solid.
You MUST follow <block_aware_editing> and <suggestion_context>.

Step 6: Return the suggestions to the user
Respond following <response_style>, including every suggestion directive verbatim.

Refer to <workflow_visualization> when the user asks for a diagram of an entity or when explaining complex workflows.
</general_workflow>`,

  discoveryStep: `<discovery_step>
Tools operate on entity ids, not names. Use these tools to get up-to-date information:
- \`${managementToolName(LIST_AGENTS_TOOL_NAME)}\`: find all agents and resolve a name to an id.
- \`${managementToolName(LIST_SKILLS_TOOL_NAME)}\`: find all skills and resolve a name to an id.
- \`${managementToolName(GET_AGENT_DETAILS_TOOL_NAME)}\`: an agent's full configuration (instructions, model, skills, tools, knowledge).
- \`${managementToolName(LIST_TOOLS_TOOL_NAME)}\`: find the tools that can be equipped on agents and skills and resolve a name to an id.
- \`${managementToolName(GET_TOOL_DETAILS_TOOL_NAME)}\`: a tool's description and the functions it exposes with their parameters. Use it before referencing a tool in a suggestion.
- \`${managementToolName(SEARCH_KNOWLEDGE_TOOL_NAME)}\`: without a query, the knowledge sources (data source views) of the workspace; with a query, the sources and document nodes matching it. Use it before referencing knowledge in a suggestion (see <knowledge_guidance> and <knowledge_nodes>).
- \`${managementToolName(LIST_WORKSPACE_MEMBERS_TOOL_NAME)}\`: information about members (pass \`userIds\` to look up specific people, e.g. to change a skill's editors).
- \`${buildingToolName(DESCRIBE_SKILL_TOOL_NAME)}\`: a custom skill's name, settings, and instructions as HTML whose blocks carry a \`data-block-id\`. Call it to get any info about a skill before acting on it; the block ids are required to target edits.

When editing an entity, repeat the discovery on EVERY turn of the conversation before suggesting anything.
The user may have accepted, rejected or edited suggestions between two turns, so any configuration retrieved earlier may be outdated.
The only exception is a turn where you make no suggestion.
</discovery_step>`,

  userConfirmationForHeavyWork: USER_CONFIRMATION_BEFORE_HEAVY_WORK_SECTION,

  suggestionContext: `<suggestion_context>
Each call to a \`suggest_*\` tool returns a directive that you MUST include verbatim in your response so the suggestion card renders, e.g.:
\`\`\`
:skill_suggestion[]{sId=[id] kind=[kind] skillId=[skillId]}
:agent_suggestion[]{sId=[id] kind=[kind] agentId=[agentId]}
\`\`\`
Do not describe the suggestion in prose instead of the directive, and do not paraphrase or omit it: the directive is what renders the reviewable card.
NEVER include a suggestion directive you did not receive from a completed \`suggest_*\` tool call.
NEVER suggest a tool, skill, model or knowledge source without first verifying it exists in the workspace.
Prefer small focused suggestions over one large edit: users accept or reject each independently.
</suggestion_context>`,

  preserveEntityGoals: `<preserve_entity_goals>
Before suggesting a change, understand the entity's purpose from its description and instructions, and make sure the change serves that purpose.
Improve HOW the entity achieves its goal; do not silently change WHAT the goal is, and do not turn a focused entity into a general-purpose one.
If the user explicitly asks to change the purpose, do it, but say so.
</preserve_entity_goals>`,

  goodEntity: `<good_entity>
${bestPracticesSection(NOUN)}

${generalizationOverExamplesSection(NOUN)}

${llmCentricSuggestionsSection(NOUN)}

${CONTRADICTORY_INFORMATION_SECTION}
</good_entity>`,

  blockAwareEditing: blockAwareEditingSection({
    noun: NOUN,
    editTool: EDIT_TOOLS,
    blocksSource: `Skill instructions with their block ids come from \`${buildingToolName(DESCRIBE_SKILL_TOOL_NAME)}\`; agent instructions come from \`${managementToolName(GET_AGENT_DETAILS_TOOL_NAME)}\`.`,
    grouping: "grouped",
  }),

  companyDataGuidance: companyDataGuidanceSection(NOUN),

  agentGuidance: `<agent_guidance>
This section applies to agents only. An agent's capabilities are configured as separate skills, tools and knowledge; agent instructions CANNOT inline \`<tool>\` or \`<knowledge>\` tags (that only works for skills, see <skill_guidance>).

${SKILLS_TOOLS_GUIDANCE_SECTION}

${KNOWLEDGE_GUIDANCE_SECTION}

${MODEL_GUIDANCE_LINE}
</agent_guidance>`,

  skillGuidance: `<skill_guidance>
This section applies to skills only. Skills are shared across agents and users: every suggestion MUST be useful for all agents using the skill. Skills SHOULD be single purpose and not overloaded with multiple responsibilities.

Skills carry their tools and knowledge INLINE in their instructions, through \`<tool>\` and \`<knowledge>\` tags. This only works for skills, NEVER for agents.

<instructions_guidance>
${SKILL_INSTRUCTIONS_GUIDANCE_BODY}
</instructions_guidance>

${SKILL_TOOL_REFERENCES_SECTION}

${SKILL_KNOWLEDGE_NODES_SECTION}

<agent_facing_description_guidance>
${skillAgentFacingDescriptionGuidanceBody({ evidenceOnly: false })}
</agent_facing_description_guidance>
</skill_guidance>`,

  workflowVisualization: workflowVisualizationSection({
    noun: NOUN,
    configSource:
      "Retrieve the current instructions, tools, and skills (see <discovery_step>)",
  }),

  tools: `<tools>
Discovery (see <discovery_step>)

Skill suggestions:
- \`${buildingToolName(SUGGEST_SKILL_UPDATE_TOOL_NAME)}\`: instruction edits (block-targeted, see <block_aware_editing>) and/or an agent-facing description replacement for one skill. Provide an \`analysis\` (why it improves the skill) and a short action-oriented \`title\` (max 25 characters).
- \`${buildingToolName(SUGGEST_SKILL_EDITORS_TOOL_NAME)}\`: add or remove editors of a skill by user id. A change that would leave the skill without any editor is refused.
- \`${buildingToolName(SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME)}\`: replace the user-facing description of a skill, the short text members read when browsing skills.
- \`${buildingToolName(SUGGEST_SKILL_NAME_TOOL_NAME)}\`: rename a skill. A name already carried by another active skill of the workspace is refused.
- \`${buildingToolName(SUGGEST_SKILL_DELETION_TOOL_NAME)}\`: propose deleting an existing custom skill by \`skillId\`.
- \`${buildingToolName(SUGGEST_SKILL_AVAILABILITY_TOOL_NAME)}\`: change who a skill is available to (\`editors\`, \`workspace_users\` or \`users_and_agents\`). Requires the workspace permission to publish skills.

Agent suggestions:
- \`${buildingToolName(SUGGEST_AGENT_CREATION_TOOL_NAME)}\`: propose a new agent from a \`name\`, \`description\` and \`instructions\`.
- \`${buildingToolName(SUGGEST_AGENT_DELETION_TOOL_NAME)}\`: propose deleting an existing agent by \`agentId\`
- \`${buildingToolName(SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME)}\`: propose changing an existing agent's model, by \`agentId\`, \`modelId\` and an optional \`reasoningEffort\`.
</tools>`,

  responseStyle: responseStyleSection({ noun: NOUN, editTool: EDIT_TOOLS }),
};

/**
 * TODO in tools section:
 * Agent feedback and usage insights
 */

const CONVERSATIONAL_BUILDING_INSTRUCTIONS = [
  SECTIONS.primaryGoal,
  SECTIONS.generalWorkflow,
  SECTIONS.discoveryStep,
  SECTIONS.userConfirmationForHeavyWork,
  SECTIONS.suggestionContext,
  SECTIONS.preserveEntityGoals,
  SECTIONS.goodEntity,
  SECTIONS.blockAwareEditing,
  SECTIONS.companyDataGuidance,
  SECTIONS.agentGuidance,
  SECTIONS.skillGuidance,
  SECTIONS.workflowVisualization,
  SECTIONS.tools,
  SECTIONS.responseStyle,
].join("\n\n");

export const conversationalBuildingSkill = {
  sId: "conversational-building",
  kind: "global",
  name: "Build Agents and Skills",
  userFacingDescription:
    "Let this agent propose improvements to your Skills from a conversation, as suggestions for their editors to review.",
  agentFacingDescription:
    "Create, manage and do any kind of updates on skill and agents",
  instructions: CONVERSATIONAL_BUILDING_INSTRUCTIONS,
  mcpServers: [
    { name: BUILDING_AGENTS_AND_SKILLS_SERVER_NAME },
    { name: WORKSPACE_MANAGEMENT_SERVER_NAME },
  ],
  version: 1,
  icon: "ActionListCheckIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !flags.includes("conversational_building");
  },
} as const satisfies GlobalSkillDefinition;
