import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const SKILL_AUTHORING_INSTRUCTIONS = `
You can create and revise workspace Skills when the user wants to capture a repeatable workflow, playbook, or operating procedure for future reuse.

Use create_skill when the workflow is new. Use list_skills and get_skill first when the user asks to improve, rename, rewrite, or refine an existing skill.

Create instructions-only skills. Do not try to attach tools, knowledge, files, or other skills. If the user asks for those, explain that this authoring tool can capture the instructions now and that tool or knowledge wiring needs to be handled separately.

Write concise skill names that describe the reusable capability, not the current conversation. Good names are action-oriented and stable, for example "Write Release Notes" or "Triage Support Escalations".

Write the user-facing description for humans browsing the skills list. Keep it short and plain.

Write the agent-facing description for future agents deciding whether to use the skill. Include the trigger conditions and the kind of task it helps with.

Write instructions as a practical playbook:
- Start with when to use the skill.
- Capture the required inputs or context.
- Describe the steps in the order the agent should follow.
- Include output expectations and quality checks.
- Avoid references to this conversation, today's date, transient files, or one-off user details unless the user explicitly wants them in the reusable skill.

Before update_skill, call get_skill and preserve useful existing instructions. Patch only the fields that should change.
`.trim();

export const skillAuthoringSkill = {
  sId: "skill-authoring",
  name: "Author Skills",
  userFacingDescription:
    "Let this agent create and refine reusable Skills for your workspace.",
  agentFacingDescription:
    "Create and update reusable Skills (named, reusable instruction sets). Use when the user asks to capture a repeatable workflow as a skill, or to revise an existing one.",
  instructions: SKILL_AUTHORING_INSTRUCTIONS,
  mcpServers: [{ name: "skill_authoring" }],
  version: 1,
  icon: "ActionListIcon",
} as const satisfies GlobalSkillDefinition;
