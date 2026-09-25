import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
  DESCRIBE_AGENT_TOOL_NAME,
  DESCRIBE_SKILL_TOOL_NAME,
  SUGGEST_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import {
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

function managementToolName(toolName: string): string {
  return getPrefixedToolName(WORKSPACE_MANAGEMENT_SERVER_NAME, toolName);
}

function buildingToolName(toolName: string): string {
  return getPrefixedToolName(BUILDING_AGENTS_AND_SKILLS_SERVER_NAME, toolName);
}

const SUGGEST = buildingToolName(SUGGEST_TOOL_NAME);

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

Changes are never applied directly: \`${SUGGEST}\` records suggestions that the entity's editors review, accept, or reject.

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
Build a plan from the retrieved configuration and the user's intent. Do not call \`${SUGGEST}\` yet.
Apply <good_entity>, <preserve_entity_goals> and, depending on the entity, <agent_guidance> or <skill_guidance>.
Determine which research is required (see <company_data_guidance>).
It is acceptable to change the plan mid-execution based on findings.

Step 5: Make the suggestions
Lead with the changes that will most affect entity behavior. Skip cosmetic fixes until fundamentals are solid.
You MUST follow <block_aware_editing>, <suggestion_context> and <batching>.

Step 6: Return the suggestions to the user
Respond following <response_style>, including every suggestion directive verbatim.

Refer to <workflow_visualization> when the user asks for a diagram of an entity or when explaining complex workflows.
</general_workflow>`,

  discoveryStep: `<discovery_step>
Tools operate on entity ids, not names. Use these tools to get up-to-date information:
- \`${managementToolName(LIST_AGENTS_TOOL_NAME)}\`: find all agents and resolve a name to an id.
- \`${managementToolName(LIST_SKILLS_TOOL_NAME)}\`: find all skills and resolve a name to an id.
- \`${managementToolName(LIST_TOOLS_TOOL_NAME)}\`: find the tools that can be equipped on agents and skills and resolve a name to an id.
- \`${managementToolName(GET_TOOL_DETAILS_TOOL_NAME)}\`: a tool's description and the functions it exposes with their parameters. Use it before referencing a tool in a suggestion.
- \`${managementToolName(SEARCH_KNOWLEDGE_TOOL_NAME)}\`: without a query, the knowledge sources (data source views) of the workspace; with a query, the sources and document nodes matching it. Use it before referencing knowledge in a suggestion (see <knowledge_guidance> and <knowledge_nodes>).
- \`${managementToolName(LIST_WORKSPACE_MEMBERS_TOOL_NAME)}\`: information about members (pass \`userIds\` to look up specific people, e.g. to change a skill's editors).
- \`${buildingToolName(DESCRIBE_SKILL_TOOL_NAME)}\`: a custom skill's name, settings, and instructions as HTML whose blocks carry a \`data-block-id\`. Call it to get any info about a skill before acting on it; the block ids are required to target edits.
- \`${buildingToolName(DESCRIBE_AGENT_TOOL_NAME)}\`: an agent's full configuration, with instructions as HTML whose blocks carry a \`data-block-id\`. Call it before targeting instruction edits on an agent; the block ids are required to target edits.

When editing an entity, repeat the discovery on EVERY turn of the conversation before suggesting anything.
The user may have accepted, rejected or edited suggestions between two turns, so any configuration retrieved earlier may be outdated.
The only exception is a turn where you make no suggestion.
</discovery_step>`,

  suggestionContext: `<suggestion_context>
Every change to an agent or a skill goes through \`${SUGGEST}\` (see <tools>): it records pending suggestions that the editors review, nothing is applied until they accept.
Each call returns one directive that you MUST include verbatim in your response so the review card renders:
\`\`\`
:batch_edit[]{sId=[id]}
\`\`\`
Do not describe the suggestions in prose instead of the directive, and do not paraphrase or omit it: the directive is what renders the reviewable card.
NEVER include a directive you did not receive from a completed \`${SUGGEST}\` call.
In the same message, name every existing entity the call changes with its mention directive, so the user can click it to open the entity (see <entity_mentions>).
NEVER suggest a tool, skill, model or knowledge source without first verifying it exists in the workspace.
Decide how to split the changes into calls following <batching>.
</suggestion_context>`,

  batching: `<batching>
All the suggestions sent in one \`${SUGGEST}\` call are reviewed together: the user accepts or rejects them as a whole.
- Group suggestions in ONE call only when they must be accepted together because they do not make sense alone: accepting some without the others would leave an agent or a skill broken or inconsistent. For example:
  - adding a tool or a skill to an agent, together with the instruction edits telling the agent when to use it;
  - extracting part of an agent's or a skill's instructions into a new skill: creating the skill, and editing the existing entity to remove the extracted instructions.
- When changes are independent, call the tool once per change, in parallel, so the user can accept or reject each one on its own. For example, renaming several agents to follow a naming convention is one call per agent.
</batching>`,

  entityMentions: `<entity_mentions>
Whenever you name an entity in your response, write it as a mention directive rather than plain text, so the user can click it to open the entity:
\`\`\`
:build_skill[skill name]{sId=[skillId]}
:build_agent[agent name]{sId=[agentId]}
\`\`\`
The label between brackets is the entity's exact name, and the \`sId\` is the id of the entity. Both are required: a mention without a resolved id does not render.
Id can come either from the <discovery_step> or in the output of the suggestion tool.
ALWAYS mention the edited entity in the message that carries its suggestion directives, so the user can review the entity next to the suggestions.
Exception: an agent or a skill created by a suggestion has no id yet. Name it in plain text, NEVER with a mention directive.
NEVER invent an id, and NEVER mention an entity you have not resolved.
</entity_mentions>`,

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
    editTool: `\`${SUGGEST}\``,
    blocksSource: `Skill instructions with their block ids come from \`${buildingToolName(DESCRIBE_SKILL_TOOL_NAME)}\`; agent instructions come from \`${buildingToolName(DESCRIBE_AGENT_TOOL_NAME)}\`.`,
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

Suggestions: \`${SUGGEST}\`, with:
- \`title\`: a short, action-oriented title for the whole call (max 25 characters).
- \`analysis\`: why these changes are needed (max 255 characters).
- \`suggestions\`: the changes, one item per entity, discriminated by \`kind\`:
  - \`create_agent\`: a new agent from a \`name\`, a \`description\` and \`instructions\` (HTML).
  - \`edit_agent\`: changes to an existing agent, by \`agentId\`: \`name\`, \`description\`, \`instructionEdits\` (block-targeted, see <block_aware_editing>), \`modelId\` with an optional \`reasoningEffort\`, \`scope\` (\`visible\` to publish, \`hidden\` to unpublish).
  - \`delete_agent\`: deletes an existing agent, by \`agentId\`.
  - \`create_skill\`: a new skill from a \`name\`, a \`userFacingDescription\`, an \`agentFacingDescription\` and \`instructions\` (HTML).
  - \`edit_skill\`: changes to an existing custom skill, by \`skillId\`: \`name\` (unique among the workspace's active skills), \`userFacingDescription\`, \`agentFacingDescription\`, \`instructionEdits\` (block-targeted, see <block_aware_editing>), \`availability\` (\`editors\`, \`workspace_users\` or \`users_and_agents\`, requires the workspace permission to publish skills), \`addEditorUserIds\` / \`removeEditorUserIds\` (a change leaving the skill without any editor is refused).
  - \`delete_skill\`: deletes an existing custom skill, by \`skillId\`.
Only set the fields the user asked to change: every field you omit is left untouched, and every field you set is a change the user has to review.
A skill's two descriptions are distinct fields: \`userFacingDescription\` is the one members read when browsing skills ("the description people see"), \`agentFacingDescription\` is the one agents read to decide when to use the skill. Change only the one the user refers to.
Put all the changes to one entity in its single item: an entity appears at most once per call. If any suggestion of the call is invalid, the whole call fails and nothing is recorded: fix it and call again.
</tools>`,

  responseStyle: responseStyleSection({
    noun: NOUN,
    editTool: `\`${SUGGEST}\``,
  }),
};

/**
 * TODO in tools section:
 * Agent feedback and usage insights
 */

const CONVERSATIONAL_BUILDING_INSTRUCTIONS = [
  SECTIONS.primaryGoal,
  SECTIONS.generalWorkflow,
  SECTIONS.discoveryStep,
  SECTIONS.suggestionContext,
  SECTIONS.batching,
  SECTIONS.entityMentions,
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
