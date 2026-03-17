import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

const SANDBOX_INSTRUCTIONS =
  "The sandbox provides an isolated Linux environment for running code, scripts, and shell commands. " +
  "Use `bash` to run commands and scripts. " +
  "The sandbox persists for the conversation duration. " +
  "Common tools like Python, Node.js, and standard Unix utilities are pre-installed.";

export const sandboxSkill = {
  sId: "sandbox",
  name: "Sandbox",
  userFacingDescription:
    "Run code, scripts, and shell commands in an isolated Linux environment.",
  agentFacingDescription:
    "Execute code and commands in an isolated Linux sandbox. Useful to parse lengthy tool outputs, run code, " +
    "process data, install packages, manipulate files, or perform any task requiring shell access.",
  instructions: SANDBOX_INSTRUCTIONS,
  mcpServers: [{ name: "sandbox" }],
  version: 1,
  icon: "CommandLineIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth.getNonNullableWorkspace());

    return !flags.includes("sandbox_tools");
  },
  isAutoEnabled: true,
} as const satisfies GlobalSkillDefinition;
