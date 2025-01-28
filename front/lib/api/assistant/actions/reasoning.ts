import type {
  AgentActionSpecification,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  ReasoningActionType,
  ReasoningConfigurationType,
  ReasoningErrorEvent,
  ReasoningOutputEvent,
  ReasoningStartedEvent,
  ReasoningThinkingEvent,
  ReasoningTokensEvent,
  Result,
} from "@dust-tt/types";
import { BaseAction, Ok } from "@dust-tt/types";

import { DEFAULT_REASONING_ACTION_NAME } from "@app/lib/api/assistant/actions/constants";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentReasoningAction } from "@app/lib/models/assistant/actions/reasoning";

interface ReasoningActionBlob {
  id: ModelId;
  agentMessageId: ModelId;
  output: string | null;
  thinking: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class ReasoningAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly output: string | null;
  readonly thinking: string | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "reasoning_action";

  constructor(blob: ReasoningActionBlob) {
    super(blob.id, "reasoning_action");

    this.agentMessageId = blob.agentMessageId;

    this.output = blob.output;
    this.thinking = blob.thinking;

    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_REASONING_ACTION_NAME,
      arguments: JSON.stringify({}),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    return {
      role: "function",
      name: this.functionCallName ?? DEFAULT_REASONING_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      // TODO(REASONING TOOL): decide if we want to add the thinking here.
      // (probably not)
      content: this.output || "(reasoning failed)",
    };
  }
}

export class ReasoningConfigurationServerRunner extends BaseActionConfigurationServerRunner<ReasoningConfigurationType> {
  async buildSpecification(
    auth: Authenticator,
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    return new Ok({
      name,
      description:
        description ||
        "Perform complex step-by-step reasoning using an advanced AI model.",
      inputs: [],
    });
  }

  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
      agentMessage,
      functionCallId,
      step,
    }: BaseActionRunParams
  ): AsyncGenerator<
    | ReasoningErrorEvent
    | ReasoningStartedEvent
    | ReasoningThinkingEvent
    | ReasoningOutputEvent
    | ReasoningTokensEvent
  > {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `runReasoningAction`"
      );
    }

    const { actionConfiguration } = this;

    const action = await AgentReasoningAction.create({
      reasoningConfigurationId: actionConfiguration.sId,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
      workspaceId: owner.id,
    });

    yield {
      type: "reasoning_started",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new ReasoningAction({
        id: action.id,
        agentMessageId: action.agentMessageId,
        output: null,
        thinking: null,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };

    // TODO(REASONING TOOL):
    // render conversation for reasoning
    void agentConfiguration, conversation;

    // TODO(REASONING TOOL):
    // Call the dust app, stream the tokens (thinking / output)

    // Here would go the actual reasoning logic
    const { output, thinking } = {
      output: "Reasoning output would go here",
      thinking: "Reasoning thinking would go here",
    };

    // if (someError) {
    //   yield {
    //     type: "reasoning_error",
    //     created: Date.now(),
    //     configurationId: agentConfiguration.sId,
    //     messageId: agentMessage.sId,
    //     error: {
    //       code: "reasoning_error",
    //       message: `Error running reasoning action: ${error}`,
    //     },
    //   };
    // }

    await action.update({
      output,
      thinking,
    });

    yield {
      type: "reasoning_thinking",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new ReasoningAction({
        id: action.id,
        agentMessageId: action.agentMessageId,
        output: action.output,
        thinking,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };

    yield {
      type: "reasoning_output",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new ReasoningAction({
        id: action.id,
        agentMessageId: action.agentMessageId,
        output,
        thinking: action.thinking,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };
  }
}

export async function reasoningActionTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<ReasoningActionType[]> {
  const models = await AgentReasoningAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return models.map((action) => {
    return new ReasoningAction({
      id: action.id,
      agentMessageId: action.agentMessageId,
      output: action.output,
      thinking: action.thinking,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
    });
  });
}
