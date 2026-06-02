import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const MANAGE_SKILLS_INSTRUCTIONS = `# Manage Skills

Use this skill to turn useful repeated work into reusable workspace skills, or to make a focused update to an existing skill.

## Workflow

Identify existing skills only by exact skill name. Do not use skill IDs.

1. Use \`create_skill\` when the user wants to capture a successful workflow as a new skill.
2. Use \`edit_skill\` only for exact instruction text substitutions. Set \`oldString\` to enough current instruction text to match exactly and uniquely.
3. Use \`upload_skill_files\` when the user wants to add or replace scripts, references, templates, or assets attached to a skill.

## Sandbox Script to Skill

When the user says they got a good result in the Computer with a script and want to save it as a skill:

1. Capture the final working script, not the failed experiments.
2. Create the skill with \`create_skill\`, or update an existing skill with targeted \`edit_skill\` substitutions when the exact current text is known.
3. If the script only exists in a sandbox-local path such as \`/tmp/\`, first copy it into the conversation files under \`/files/\`.
4. Upload the script with \`upload_skill_files\` by passing the source file path. Set \`fileName\` only when the script should be stored under a specific skill path like \`scripts/<clear-name>.<ext>\`.
5. Write instructions that run the script directly from the mounted skill files. Skill files are loaded into the Computer at \`/skills/<skill name>/<file name>\`, so reference a command like \`python "/skills/My Skill/scripts/process.py" ...\`.
6. Include only the inputs the future agent must provide, the expected output, and any verification step that caught issues in the original run.

## Writing Skills

- Keep skills single-purpose. Prefer one concrete workflow over a broad grab bag.
- Write concise, imperative instructions. Include only non-obvious procedure, constraints, and reusable decisions.
- Put trigger guidance in the description: what the skill does and when an agent should use it.
- Put reusable scripts, examples, templates, or reference material in attached files instead of bloating instructions.
- Do not add auxiliary documentation files such as README, changelog, setup guide, or quick reference unless they are directly needed by the skill.

## Files

When attaching files with \`upload_skill_files\`, pass the source \`path\` of each file instead of copying its content into the tool call. Use paths returned by the Files tools, such as \`conversation-<id>/script.py\`, or the corresponding sandbox path under \`/files/\`. If a file only exists elsewhere in the sandbox, copy it under \`/files/\` first. Prefer meaningful destination \`fileName\` values such as \`scripts/import.py\`, \`references/policy.md\`, or \`assets/template.json\` when the source basename is not enough.`;

export const manageSkillsSkill = {
  sId: "manage_skills",
  name: "Manage Skills",
  userFacingDescription:
    "Create new workspace skills and edit existing skill instructions or files.",
  agentFacingDescription:
    "Create or edit workspace skills. Use when the user wants to turn a successful workflow into a reusable skill, improve skill instructions, or attach files to a skill.",
  instructions: MANAGE_SKILLS_INSTRUCTIONS,
  mcpServers: [{ name: "skills" }],
  version: 1,
  icon: "PuzzleIcon",
  isRestricted: async (auth: Authenticator) => {
    if (!auth.isBuilder()) {
      return true;
    }

    const flags = await getFeatureFlags(auth);

    return !flags.includes("skill_edition_tools");
  },
} as const satisfies GlobalSkillDefinition;
