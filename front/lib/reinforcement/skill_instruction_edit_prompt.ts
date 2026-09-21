import { AGENT_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";

// Prompt fragments about editing skills. Shared by the reinforcement analysis
// (edit_skill tool) and the conversational-building skill (suggest_skill_update tool).

// Bodies without their wrapping tag: consumers wrap them in the tag they need.
export const SKILL_INSTRUCTIONS_GUIDANCE_BODY = `When suggesting instruction improvements for skills, follow these principles:

- Focus on actionable information that changes what the skill does.
- Preserve the skill's existing goals — NEVER change what the goal is, only improve HOW it achieves it.
- Instructions SHOULD reference how to use tools that are inlined in the skill instructions.
- Suggestions ALWAYS need to be using the same language as the existing instructions OR, for new skills, the language of the user conversation.
- Prefer small, focused changes over large rewrites.
- Extract the INTENT from examples, not the literal pattern.
- Filter out information only relevant for humans, not the LLM.`;

export const SKILL_KNOWLEDGE_NODES_SECTION = `<knowledge_nodes>
Instructions can reference specific workspace knowledge nodes using inline \`<knowledge>\` tags.
During runtime, the content of the knowledge nodes is rendered directly in the instruction text.

\`\`\`
<knowledge id="NODE_ID" title="NODE_TITLE" space="SPACE_ID" dsv="DSV_ID" hasChildren="true|false"/>
\`\`\`

Attribute mapping from search_knowledge results:
- \`id\` => \`nodeId\`
- \`title\` => \`title\`
- \`space\` => \`spaceId\`
- \`dsv\` => \`dataSourceViewId\`
- \`hasChildren\` => \`"true"\` or \`"false"\`

To embed a knowledge node:
1. Call \`search_knowledge\` with a relevant query to find candidate nodes.
2. Pick the node whose title and content best match what the skill should reference.
3. Embed the self-closing tag inline inside a \`<p>\` block.

Example:
\`\`\`
<p data-block-id="a1b2c3d4">When answering questions about onboarding, refer to <knowledge id="doc_abc123" title="Onboarding Guide" space="space_xyz" dsv="dsv_456" hasChildren="false"/>.</p>
\`\`\`
</knowledge_nodes>`;

export const SKILL_TOOL_REFERENCES_SECTION = `<tool_references>
Instructions can reference MCP tools using inline \`<tool>\` tags.
During runtime, tools referenced this way are attached to the skill and available to the agent using it.

\`\`\`
<tool id="MCP_SERVER_VIEW_ID" name="MCP_SERVER_DISPLAY_NAME"/>
\`\`\`

Attribute mapping from get_available_tools results:
- tag \`id\` <= \`ID\`
- tag \`name\` <= \`name\`

To embed a tool reference:
1. Call \`get_available_tools\` to find the candidate MCP server view.
2. Call \`describe_mcp\` for that MCP server view before writing instructions about exact tool names, inputs, or workflows.
3. Embed the self-closing tag inline inside the relevant instruction block.

To remove a tool reference, remove the \`<tool>\` tag and any instructions that only make sense with that tool.

Example:
\`\`\`
<p data-block-id="a1b2c3d4">When researching pull requests, use <tool id="mcp_server_view_123" name="GitHub"/> and summarize the files changed before commenting.</p>
\`\`\`
</tool_references>`;

/**
 * @param evidenceOnly When true (reinforcement), only suggest edits backed by conversation evidence.
 */
export function skillAgentFacingDescriptionGuidanceBody({
  evidenceOnly,
}: {
  evidenceOnly: boolean;
}): string {
  const when = evidenceOnly
    ? `Suggest editing it only when the conversation surfaces clear evidence of a routing problem:
- The agent enabled the skill in a situation it does not actually cover.
- The agent failed to enable the skill in a situation that should obviously have triggered it.
- The current description is misleading, vague, or incomplete in a way that explains the routing mistake.`
    : `Suggest editing it when:
- The user asks for it.
- The agent enables the skill in situations it does not actually cover, or fails to enable it when it obviously should.
- The current description is misleading, vague, or incomplete.`;

  return `The agent-facing description (\`<agentFacingDescription>\` in the skill context) is what the agent reads to decide WHEN to enable the skill. It is NOT the skill's behavior — that lives in \`<instructions>\`.

${when}

When suggesting a description edit:
- Provide the FULL replacement text in \`agentFacingDescriptionEdit.content\` — it overwrites the existing description.
- Max description size is ${AGENT_FACING_DESCRIPTION_MAX_LENGTH} characters.
- Preserve the skill's actual purpose. Sharpen the trigger conditions; do not redefine the skill.
- Keep it focused on routing signals (when to use, what scenarios). Do not duplicate the instructions.
- Use the same language as the existing description.`;
}

const BASE_SKILL_INSTRUCTION_HTML_EDIT_PROMPT = `
Skill instructions are organized as a hierarchy of blocks. You design this hierarchy
so that future edits are precise. Group related instructions under parent blocks.
Keep each leaf block to a single concern. A well-structured hierarchy means most
changes target one block — a leaf to tweak wording, a parent to rework a concern,
the root only for full rewrites.

Each block has a unique \`data-block-id\` attribute, an 8-character random identifier (e.g., "7f3a2b1c").
These IDs are persisted and stable across editing sessions.

The skill instructions (with \`data-block-id\` on each block) appear in \`<instructions>\` in the skill context.

<grouping_edits>
Put several \`instructionEdits\` in the same \`edit_skill\` call when they should be approved/rejected atomically.
Use separate \`edit_skill\` calls when the improvements are independent. Each call becomes its own suggestion for review.
</grouping_edits>

<block_editing_principles>
1. Targeting a block means REPLACING its content:
- If the change fits inside the existing block → target that block, return one element.
- If the change needs new sibling blocks → target the parent that contains them.
  The parent might be an instruction block or the root (targetBlockId "${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}").
  You should avoid re-writing the root unless you need to restructure the entire instructions.
  For full rewrites, target the root. Use \`targetBlockId: "${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"\` with content wrapped in \`<div data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}">...</div>\` to replace all instructions at once.
2. One \`edit_skill\` call may include several \`instructionEdits\` when they target different blocks. Each entry must use a distinct \`targetBlockId\`; duplicate targets in the same call are rejected.
3. Copy block IDs exactly from the skill context. They are opaque identifiers — never invent or guess them.
4. Always include the wrapping tag. Content must include the element's tag (e.g., \`<p>...</p>\`).
5. The \`content\` value must be a single-line string with no literal newline characters. Write \`<p>Line 1</p><p>Line 2</p>\`, never split across lines. Literal newlines inside a JSON string value cause a parse error.
</block_editing_principles>

<block_examples>
EXAMPLE 1: Change the output format
\`\`\`
<p data-block-id="a1b2c3d4">You are a data analyst that processes customer feedback.</p>
<p data-block-id="e5f6a7b8">Return results as a bulleted list.</p>
\`\`\`
\`\`\`json
{ "targetBlockId": "e5f6a7b8", "type": "replace", "content": "<p>Return results as JSON.</p>" }
\`\`\`

EXAMPLE 2: Full rewrite
\`\`\`json
{ "targetBlockId": "${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}", "type": "replace", "content": "<div data-type=\\"${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}\\"><h2>Role</h2><p>You are a helpful assistant.</p><h2>Output</h2><p>Always respond in JSON.</p></div>" }
\`\`\`
</block_examples>

<structure_recommendations>
Allowed inline formatting: \`<strong>\`, \`<em>\`, \`<code>\`, \`<a href="...">\`.
Allowed block structures: \`<ul><li>\`, \`<ol><li>\`, \`<pre><code>\`.
</structure_recommendations>

${SKILL_KNOWLEDGE_NODES_SECTION}`;

export const SKILL_INSTRUCTION_HTML_EDIT_PROMPT = `${BASE_SKILL_INSTRUCTION_HTML_EDIT_PROMPT}

${SKILL_TOOL_REFERENCES_SECTION}`;
