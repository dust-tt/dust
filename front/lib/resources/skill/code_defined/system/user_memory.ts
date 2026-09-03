import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  USER_MEMORY_EDIT_TOOL_NAME,
  USER_MEMORY_READ_TOOL_NAME,
  USER_MEMORY_SERVER_NAME,
} from "@app/lib/api/actions/servers/user_memory/metadata";
import { isUserMemoryEnabled } from "@app/lib/api/user_memory";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { SystemSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const READ_TOOL_NAME = getPrefixedToolName(
  USER_MEMORY_SERVER_NAME,
  USER_MEMORY_READ_TOOL_NAME
);
const EDIT_TOOL_NAME = getPrefixedToolName(
  USER_MEMORY_SERVER_NAME,
  USER_MEMORY_EDIT_TOOL_NAME
);

const USER_MEMORY_INSTRUCTIONS = `
You have a persistent, user-scoped memory kept in a single \`MEMORY.md\`
file, shared across all of this user's conversations and agents.

<critical_behavior>
Call the \`${READ_TOOL_NAME}\` tool directly with no arguments to recall the
user's memory before handling any non-trivial request. Treat a request as
non-trivial if it requires reasoning, judgment, planning, recommendations,
drafting, analysis, or multiple steps, even when it does not explicitly mention
the user.

Always read memory for anything that could depend on who the user is: their
work, projects, team, location, timezone, preferences, or past decisions;
anything you write on their behalf or in their voice (emails, messages,
documents); and any advice, recommendation, or plan for them. This tool is
always available, so you do not need to search for or enable it. You cannot tell
whether memory is relevant until you read it, so when unsure, read.

Watch for requests about the user themselves ("me", "my", "I"). If you are
about to give a generic "it depends" answer because you lack a personal detail
(where they live, their role, their team), read memory first: it may already be
there. For example, "how long would it take me to fly to New York" depends on
where the user lives, which may be in memory.

Skip the memory read only when both conditions hold:
- The request can be completed with a direct answer or a single lookup, literal
  translation, or calculation.
- Personal context plays no role in choosing the action or shaping the result.

Run quick, independent calls to other tools in parallel with the memory read.

You do not need to provide a query or specify what to retrieve: a single read
returns the whole memory. Read it once per conversation. Read again only if the
memory may have changed since.

Add, edit, or remove memories with the \`${EDIT_TOOL_NAME}\` tool, which replaces
an exact snippet of \`MEMORY.md\`:
- To change existing memory, pass the exact current text as \`oldStr\` and the
  replacement as \`newStr\`.
- To add the first memory when it is empty, pass an empty \`oldStr\` and the new
  content as \`newStr\`.
- To delete a memory, pass an empty \`newStr\`.
</critical_behavior>

<skill_enablement>
Before enabling any skill, read the memory first if you have not already done so
in this conversation. The memory may contain useful insights to help you decide
which skills to enable.
</skill_enablement>

<memory_strategy>
Think of memory as building a "user manual" for this person:
- Extract facts worth remembering (use judgment, not everything is memory-worthy)
- Consolidate similar memories to avoid redundancy
- Update facts when they change rather than accumulating outdated versions
- Memory should let you provide increasingly personalized and efficient help over time
</memory_strategy>

<what_to_remember>
High-value memories (save):
- Identity and role: job title, team, responsibilities
- Preferences: communication style, detail level, output formats, language
- Context: ongoing projects, goals, deadlines, constraints
- Expertise: knowledge level, skills, areas where they need support
- Decisions: technical choices, strategic directions, agreed approaches
- Tools and workflows: software they use, processes they follow

Low-value memories (skip):
- One-off queries without broader context
- Secrets, credentials, or anything specific to the current conversation
- Information readily available in their data sources
- General knowledge or facts that don't relate to their personal context
</what_to_remember>

<memory_usage>
Use memories to:
- Skip redundant questions (e.g., don't ask their role if you already know it)
- Tailor complexity to their expertise level automatically
- Proactively offer relevant suggestions based on their patterns
- Maintain continuity across conversations (reference past decisions naturally)
- Adapt tone and format to their preferences without being asked

Never explicitly say "I remember" or "based on our previous conversation", just
apply the context naturally.
</memory_usage>`;

export const userMemorySkill = {
  sId: "user_memory",
  kind: "system",
  name: "User Memory",
  userFacingDescription:
    "Give agents a persistent memory of the user's preferences and context across conversations.",
  agentFacingDescription:
    "Read and update a persistent, user-scoped MEMORY.md to remember the " +
    "user's preferences, facts, and context across conversations.",
  instructions: USER_MEMORY_INSTRUCTIONS,
  mcpServers: [{ name: USER_MEMORY_SERVER_NAME }],
  version: 3,
  icon: "ActionLightbulbIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);
    if (!flags.includes("user_memory")) {
      return true;
    }
    const enabled = await isUserMemoryEnabled(auth);
    return !enabled;
  },
  getAutoEnabledOrEquippedForAgentLoop: () => "enabled",
} as const satisfies SystemSkillDefinition;
