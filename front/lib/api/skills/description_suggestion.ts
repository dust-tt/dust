import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { ModelConversationTypeMultiActions, Result } from "@app/types";
import { Err, getLargeWhitelistedModel, Ok } from "@app/types";

const FUNCTION_NAME = "send_suggestion";

const specifications: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description: "Send a suggestion of description for the skill",
    inputSchema: {
      type: "object",
      properties: {
        suggestion: {
          type: "string",
          description:
            "A description of the skill using 1 short sentence. Be factual, clear and concise. " +
            "Do not use more than 15 words.",
        },
      },
      required: ["suggestion"],
    },
  },
];

export interface SkillDescriptionSuggestionInputs {
  instructions: string;
  agentFacingDescription: string;
  tools: { name: string; description: string }[];
}

function getConversationContext(
  inputs: SkillDescriptionSuggestionInputs
): ModelConversationTypeMultiActions {
  const parts: string[] = [];

  if (inputs.agentFacingDescription) {
    parts.push(
      `## Skill purpose (when to use)\n\n${inputs.agentFacingDescription}`
    );
  }

  if (inputs.instructions) {
    parts.push(`## Skill instructions (how to use)\n\n${inputs.instructions}`);
  }

  if (inputs.tools.length > 0) {
    const toolsText = inputs.tools
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join("\n");
    parts.push(`## Available tools (what to use)\n\n${toolsText}`);
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

export async function getSkillDescriptionSuggestion(
  auth: Authenticator,
  inputs: SkillDescriptionSuggestionInputs
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
      temperature: 0.5,
      useCache: false,
    },
    {
      conversation: getConversationContext(inputs),
      prompt:
        "The user is creating a skill (reusable capability) for an AI assistant. " +
        "Based on the provided purpose, instructions, and available tools, " +
        "suggest a short user-facing description of the skill. " +
        "Focus on what the skill does for the user.",
      specifications,
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType: "skill_builder_description_suggestion",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  if (res.value.actions?.[0]?.arguments?.suggestion) {
    const { suggestion } = res.value.actions[0].arguments;

    if (typeof suggestion === "string") {
      return new Ok(suggestion);
    }
  }

  return new Err(new Error("No suggestion found"));
}
