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

const USER_MEMORY_INSTRUCTIONS = `<memory_guidelines>
You have a persistent, user-scoped memory kept in a single \`MEMORY.md\` file, shared across all of this user's conversations and agents.

<critical_behavior>
Recall the user's memory with the \`${READ_TOOL_NAME}\` tool when prior context about the user is likely to change your answer: recurring workflows, personal preferences, ongoing projects, or requests that assume context you don't have. Do not recall for general knowledge requests.

Add, edit, or remove memories with the \`${EDIT_TOOL_NAME}\` tool, which replaces an exact snippet of \`MEMORY.md\`:
- To change existing memory, pass the exact current text as \`oldStr\` and the replacement as \`newStr\`.
- To add the first memory when it is empty, pass an empty \`oldStr\` and the new content as \`newStr\`.
- To delete a memory, pass an empty \`newStr\`.
</critical_behavior>

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
- Temporal states: "working on X today", "currently debugging"
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

Never explicitly say "I remember" or "based on our previous conversation", just apply the context naturally.
</memory_usage>
</memory_guidelines>`;

export const userMemorySkill = {
  sId: "user_memory",
  kind: "system",
  name: "User Memory",
  userFacingDescription:
    "Give agents a persistent memory of the user's preferences and context across conversations.",
  agentFacingDescription:
    "Read and update a persistent, user-scoped MEMORY.md to remember the user's preferences, facts, and context across conversations.",
  instructions: USER_MEMORY_INSTRUCTIONS,
  mcpServers: [{ name: USER_MEMORY_SERVER_NAME }],
  version: 1,
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
