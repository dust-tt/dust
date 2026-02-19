import type { InternalActionIcons } from "@app/components/resources/resources_icons";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import { getLargeWhitelistedModel } from "@app/types/assistant/assistant";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";

const FUNCTION_NAME = "send_icon_suggestion";

// Curated list of icons suitable for skills, with semantic descriptions.
const SKILL_ICON_OPTIONS = [
  { name: "ActionAtomIcon", description: "Science, research, deep analysis" },
  { name: "ActionBrainIcon", description: "Thinking, AI, intelligence" },
  { name: "ActionDocumentTextIcon", description: "Documents, text, writing" },
  {
    name: "ActionEmotionLaughIcon",
    description: "Fun, creative, entertainment",
  },
  { name: "ActionFrameIcon", description: "Structure, layout, design" },
  {
    name: "ActionGitBranchIcon",
    description: "Version control, branches, code",
  },
  { name: "ActionGlobeAltIcon", description: "Web, international, global" },
  { name: "ActionImageIcon", description: "Images, visuals, graphics" },
  { name: "ActionLightbulbIcon", description: "Ideas, insights, suggestions" },
  { name: "ActionLockIcon", description: "Security, privacy, protection" },
  {
    name: "ActionMagnifyingGlassIcon",
    description: "Search, discovery, investigation",
  },
  {
    name: "ActionMegaphoneIcon",
    description: "Announcements, marketing, outreach",
  },
  { name: "ActionNoiseIcon", description: "Audio, sound, voice" },
  { name: "ActionPieChartIcon", description: "Charts, reports, visualization" },
  { name: "ActionRobotIcon", description: "Automation, bots, AI agents" },
  { name: "ActionScanIcon", description: "Scanning, reading, extraction" },
  { name: "ActionSlideshowIcon", description: "Presentations, slides, demos" },
  { name: "ActionSpeakIcon", description: "Speech, conversation, dialogue" },
  { name: "ActionTableIcon", description: "Tables, spreadsheets, data grids" },
  { name: "ActionTimeIcon", description: "Time, scheduling, deadlines" },
  { name: "ToolsIcon", description: "Tools, utilities, configuration" },
] as const satisfies {
  name: keyof typeof InternalActionIcons;
  description: string;
}[];

const specifications: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description: "Select the most appropriate icon for the skill",
    inputSchema: {
      type: "object",
      properties: {
        icon: {
          type: "string",
          description:
            "The name of the icon that best represents the skill. " +
            "Must be one of the available icon names.",
          enum: SKILL_ICON_OPTIONS.map((i) => i.name),
        },
      },
      required: ["icon"],
    },
  },
];

export interface SkillIconSuggestionInputs {
  name: string;
  instructions: string;
  agentFacingDescription: string;
}

function getConversationContext(
  inputs: SkillIconSuggestionInputs
): ModelConversationTypeMultiActions {
  const parts: string[] = [];

  parts.push(`## Skill name\n\n${inputs.name}`);

  if (inputs.agentFacingDescription) {
    parts.push(
      `## Skill purpose (when to use)\n\n${inputs.agentFacingDescription}`
    );
  }

  if (inputs.instructions) {
    parts.push(`## Skill instructions (how to use)\n\n${inputs.instructions}`);
  }

  return {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: parts.join("\n\n") }],
        name: "",
      },
    ],
  };
}

export async function getSkillIconSuggestion(
  auth: Authenticator,
  inputs: SkillIconSuggestionInputs
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const model = getLargeWhitelistedModel(owner);

  if (!model) {
    return new Err(
      new Error("No whitelisted models were found for the workspace.")
    );
  }

  const res = await runMultiActionsAgent(
    auth,
    {
      functionCall: FUNCTION_NAME,
      modelId: model.modelId,
      providerId: model.providerId,
      temperature: 0.2,
      useCache: false,
    },
    {
      conversation: getConversationContext(inputs),
      prompt:
        "The user is creating a skill (reusable capability) for an AI agent. " +
        "Based on the skill name, purpose, and instructions, " +
        "pick the most appropriate icon from the available options. " +
        "Choose the icon that best represents what this skill does." +
        'The "icon" property of the `skill_builder_icon_suggestion` function must be set to exactly one of the available icon names.' +
        "## Available icons\n\n" +
        SKILL_ICON_OPTIONS.map((i) => `- **${i.name}**: ${i.description}`).join(
          "\n"
        ),
      specifications,
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType: "skill_builder_icon_suggestion",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  if (res.value.actions?.[0]?.arguments?.icon) {
    const { icon } = res.value.actions[0].arguments;

    if (isString(icon) && SKILL_ICON_OPTIONS.some((i) => i.name === icon)) {
      return new Ok(icon);
    }
  }

  return new Err(new Error("No icon suggestion found"));
}
