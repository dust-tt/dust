import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Err, getSmallWhitelistedModel, Ok } from "@app/types";

const FIND_AGENTS_AND_TOOLS_FUNCTION_NAME = "find_agents_and_tools";

const VoiceAgentFinderResponseSchema = t.type({
  augmented_message: t.array(
    t.union([
      t.type({
        type: t.literal("text"),
        text: t.string,
      }),
      t.type({
        type: t.literal("mention"),
        name: t.string,
      }),
    ])
  ),
});

const specifications: AgentActionSpecification[] = [
  {
    name: FIND_AGENTS_AND_TOOLS_FUNCTION_NAME,
    description: "Find agents and tools in a message",
    inputSchema: {
      type: "object",
      properties: {
        augmented_message: {
          type: "array",
          description:
            "A list of messages. Either text or mentions (for agents)",
          items: {
            type: "object",
            properties: {
              type: {
                enum: ["text", "mention"],
              },
              id: {
                type: "number",
              },
              name: {
                type: "string",
              },
              text: {
                type: "string",
              },
            },
          },
        },
      },
      required: ["augmented_message"],
    },
  },
];

const INSTRUCTIONS = `# Goal
Your goal is to extract names of AI agents from the query. Think finding the "hey siri" or "ok google" from a text.
The query is an output of a speech to text AI model. In this output we want to understand the intent of the users to call AI agents. We want you to call a function as a result.

The list of possible agent names is: {{AGENTS_LIST}}

## query
The output of a speech to text AI model

## function call
Call the function \`find_agents_and_tools\`. It take only one parameter called \`augmented_message\`.
\`augmented_message\` is an array of objects. Each element of the array are either:
* text, format {"type":"text", "text":"$TEXT"}
* mention, format {"type":"mention", "name":"$AGENT_NAME"}

# Guidelines
- Understand the intent of the user, as agents can be named as real life words
- Ensure mentions are part of the agent list
- As the output is from a speech to text model there can be some transcribing mistakes, make sure to take them into account
- Put the mentions at the beginning of the array
- An agent name can me multiple words in CamelCase, try to find them

# Examples
query: dust what time is it?
agents_list: ["dust", "god", "soupinou"]
function call: find_agents_and_tools with [{"type": "mention", "name": "dust"},{"type": "text", "text": "what time is it?"}]

query: hey dost what time is it?
agents_list: ["dust", "god", "soupinou"]
function call: find_agents_and_tools with [{"type": "mention", "name": "dust"},{"type": "text", "text": "what time is it?"}]

query: hey image what time is it?
agents_list: ["dust", "god", "soupinou"]
function call: find_agents_and_tools with [{"type": "text", "text": "hey image what time is it?"}]

query: another one bites the dust
agents_list: ["dust", "god", "soupinou"]
function call: find_agents_and_tools with [{"type": "text", "text": "another one bites the dust"}]

query: I want an image representing a bird
agents_list: ["dust", "god", "soupinou"]
function call: find_agents_and_tools with [{"type": "text", "text": "I want an image representing a bird"}]

query: draft an email explaining to mickael the image of god he sent me is inappropriate
agents_list: ["dust", "god", "soupinou"]
function call: find_agents_and_tools with [{"type": "text", "text": "draft an email explaining to mickael the image of god he sent me is inappropriate"}]

query: draft an email to mickael with dust and append an apology at the end
agents_list: ["dust", "god", "soupinou"]
function call: find_agents_and_tools with [{"type": "mention", "name": "dust"}, {"type": "text", "text": "draft an email to mickael"},{"type": "text", "text": "and append an apology at the end"}]

query: I want to know more about the company culture god
agents_list: ["dust", "god", "soupinou"]
function call: find_agents_and_tools with [{"type": "mention", "name": "god"},{"type": "text", "text": "I want to know more about the company culture"}]

query: Give me the time!
agents_list: ["dust", "god", "soupinou", "GiveMeTheTime"]
function call: find_agents_and_tools with [{"type": "mention", "name": "GiveMeTheTime"}]`;

export type AugmentedMessageFromLLM =
  | { type: "text"; text: string }
  | { type: "mention"; name: string };

export async function findAgentsInMessageGeneration(
  auth: Authenticator,
  inputs: { agentsList: string[]; message: string }
): Promise<Result<{ augmentedMessages: AugmentedMessageFromLLM[] }, Error>> {
  const model = getSmallWhitelistedModel(auth.getNonNullableWorkspace());
  if (!model) {
    return new Err(
      new Error(
        "Failed to find a whitelisted model to find agents and tools from voice"
      )
    );
  }

  const instructionsWithAgents = INSTRUCTIONS.replace(
    "{{AGENTS_LIST}}",
    JSON.stringify(inputs.agentsList)
  );

  const res = await runMultiActionsAgent(
    auth,
    {
      functionCall: FIND_AGENTS_AND_TOOLS_FUNCTION_NAME,
      modelId: model.modelId,
      providerId: model.providerId,
      temperature: 0.2,
      useCache: false,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: inputs.message.trim() }],
            name: "",
          },
        ],
      },
      prompt: instructionsWithAgents,
      specifications,
      forceToolCall: FIND_AGENTS_AND_TOOLS_FUNCTION_NAME,
    },
    {
      context: {
        operationType: "voice_agent_finder",
        userId: auth.user()?.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  if (!res.value.actions?.[0].arguments) {
    return new Ok({ augmentedMessages: [] });
  }

  const responseValidation = VoiceAgentFinderResponseSchema.decode(
    res.value.actions[0].arguments
  );

  if (isLeft(responseValidation)) {
    const pathError = reporter.formatValidationErrors(responseValidation.left);
    return new Err(
      new Error(
        `Error retrieving augmented messages from arguments: ${pathError}`
      )
    );
  }

  return new Ok({
    augmentedMessages: responseValidation.right.augmented_message,
  });
}
