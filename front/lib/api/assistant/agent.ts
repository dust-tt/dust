import type {
  AgentActionConfigurationType,
  AgentActionEvent,
  AgentActionSpecification,
  AgentActionSuccessEvent,
  AgentConfigurationType,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationConfigurationType,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  ConversationType,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/types";
import {
  assertNever,
  cloneBaseConfig,
  DustProdActionRegistry,
  Err,
  GPT_4_TURBO_MODEL_CONFIG,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  Ok,
  removeNulls,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import { generateDustAppRunSpecification } from "@app/lib/api/assistant/actions/dust_app_run";
import { generateProcessSpecification } from "@app/lib/api/assistant/actions/process";
import { generateRetrievalSpecification } from "@app/lib/api/assistant/actions/retrieval";
import { generateTablesQuerySpecification } from "@app/lib/api/assistant/actions/tables_query";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import {
  constructPrompt,
  renderConversationForModel,
} from "@app/lib/api/assistant/generation";
import { runLegacyAgent } from "@app/lib/api/assistant/legacy_agent";
import type { Authenticator } from "@app/lib/auth";

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// nor updating it (responsability of the caller based on the emitted events).
export async function* runAgent(
  auth: Authenticator,
  configuration: LightAgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
  void
> {
  const fullConfiguration = await getAgentConfiguration(
    auth,
    configuration.sId
  );
  if (!fullConfiguration) {
    throw new Error(
      `Unreachable: could not find detailed configuration for agent ${configuration.sId}`
    );
  }
  if (isLegacyAgent(fullConfiguration)) {
    for await (const event of runLegacyAgent(
      auth,
      fullConfiguration,
      conversation,
      userMessage,
      agentMessage
    )) {
      yield event;
    }
  } else {
    throw new Error("Multi-actions agents are not supported yet.");
  }
}

// This function returns true if the agent is a "legacy" agent with a forced schedule,
// i.e it has a maxToolsUsePerRun <= 2, every possible iteration has a forced action,
// and every tool is forced at a certain iteration.
function isLegacyAgent(configuration: AgentConfigurationType): boolean {
  // TODO(@fontanierh): change once generation is part of actions.
  const actions = removeNulls([
    ...configuration.actions,
    configuration.generation,
  ]);

  return (
    configuration.maxToolsUsePerRun <= 2 &&
    Array.from(Array(configuration.maxToolsUsePerRun).keys()).every((i) =>
      actions.some((a) => a.forceUseAtIteration === i)
    ) &&
    actions.every((a) => a.forceUseAtIteration !== undefined)
  );
}

// This method is used by the multi-actions execution loop to pick the next action
// to execute and generate its inputs.
export async function getNextAction(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType
): Promise<
  Result<
    {
      action: AgentActionConfigurationType | AgentGenerationConfigurationType;
      inputs: Record<string, string | boolean | number>;
    },
    Error
  >
> {
  const prompt = await constructPrompt(
    auth,
    userMessage,
    configuration,
    "You are a conversational assistant with access to function calling."
  );

  // TODO(@fontanierh): revisit
  const model = GPT_4_TURBO_MODEL_CONFIG;

  const MIN_GENERATION_TOKENS = 2048;

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel({
    conversation,
    model,
    prompt,
    allowedTokenCount: model.contextSize - MIN_GENERATION_TOKENS,
  });

  if (modelConversationRes.isErr()) {
    return modelConversationRes;
  }

  const specifications: AgentActionSpecification[] = [];
  for (const a of configuration.actions) {
    if (isRetrievalConfiguration(a)) {
      const r = await generateRetrievalSpecification(auth, {
        actionConfiguration: a,
        name: a.name ?? undefined,
        description: a.description ?? undefined,
      });

      if (r.isErr()) {
        return r;
      }

      specifications.push(r.value);
    } else if (isDustAppRunConfiguration(a)) {
      const r = await generateDustAppRunSpecification(auth, {
        actionConfiguration: a,
        name: a.name ?? undefined,
        description: a.description ?? undefined,
      });

      if (r.isErr()) {
        return r;
      }

      specifications.push(r.value);
    } else if (isTablesQueryConfiguration(a)) {
      const r = await generateTablesQuerySpecification(auth, {
        name: a.name ?? undefined,
        description: a.description ?? undefined,
      });

      if (r.isErr()) {
        return r;
      }

      specifications.push(r.value);
    } else if (isProcessConfiguration(a)) {
      const r = await generateProcessSpecification(auth, {
        actionConfiguration: a,
        name: a.name ?? undefined,
        description: a.description ?? undefined,
      });

      if (r.isErr()) {
        return r;
      }

      specifications.push(r.value);
    } else {
      assertNever(a);
    }
  }

  specifications.push({
    name: "reply_to_user",
    description:
      "Reply to the user with a message. You don't need to generate any arguments for this function.",
    inputs: [],
  });

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-use-tools"].config
  );
  config.MODEL.function_call = "auto";
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await runActionStreamed(auth, "assistant-v2-use-tools", config, [
    {
      conversation: modelConversationRes.value.modelConversation,
      specifications,
      prompt,
    },
  ]);

  if (res.isErr()) {
    return new Err(
      new Error(
        `Error running use-tools action: [${res.error.type}] ${res.error.message}`
      )
    );
  }

  const { eventStream } = res.value;

  const output: {
    name?: string;
    arguments?: Record<string, string | boolean | number>;
  } = {};

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(
        new Error(`Error generating action inputs: ${event.content.message}`)
      );
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(new Error(`Error generating action inputs: ${e.error}`));
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const v = e.value as any;
        if (Array.isArray(v)) {
          const first = v[0];
          if ("name" in first) {
            output.name = first.name;
          }
          if ("arguments" in first) {
            output.arguments = first.arguments;
          }
        }
      }
    }
  }

  if (!output.name) {
    return new Err(new Error("No action found"));
  }
  output.arguments = output.arguments ?? {};

  const action =
    output.name === "reply_to_user"
      ? configuration.generation
      : configuration.actions.find((a) => a.name === output.name);
  if (!action) {
    return new Err(new Error(`Action ${output.name} not found`));
  }

  return new Ok({
    action,
    inputs: output.arguments,
  });
}
