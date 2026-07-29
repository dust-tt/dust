import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  USER_MEMORY_EDIT_TOOL_NAME,
  USER_MEMORY_READ_TOOL_NAME,
  USER_MEMORY_SERVER_NAME,
} from "@app/lib/api/actions/servers/user_memory/metadata";
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
You have a persistent, user-scoped memory kept in a single \`MEMORY.md\` file that is shared across all of this user's conversations and agents. Use it to remember durable facts and preferences about the user so you can personalize your responses over time.

**Recall before answering**: call \`${READ_TOOL_NAME}\` to load what you already know about the user, especially when personalization would help.

**Record durable context**: call \`${EDIT_TOOL_NAME}\` to save new long-lived facts, preferences, or context, and to correct or remove entries that are no longer accurate. \`${EDIT_TOOL_NAME}\` replaces an exact snippet of \`MEMORY.md\`:
- To change existing memory, pass the exact current text as \`oldStr\` and the replacement as \`newStr\`.
- To add the very first memory when it is empty, pass an empty \`oldStr\` and the new content as \`newStr\`.
- To delete a memory, pass an empty \`newStr\`.

Store durable, user-level information that helps you personalize future responses, such as:
- Who they are: role, team, and areas of responsibility.
- How they like to work: communication style and tone, level of detail, preferred output formats, and language.
- Stable context: recurring projects and goals, key people or teams they work with, the tools and tech stack they use, and their timezone or location.
- Explicit instructions they ask you to remember for next time.

Do NOT store secrets, credentials, one-off task details, or anything specific to the current conversation that won't matter later.
`;

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
    return !flags.includes("user_memory");
  },
  getAutoEnabledOrEquippedForAgentLoop: () => "enabled",
} as const satisfies SystemSkillDefinition;
