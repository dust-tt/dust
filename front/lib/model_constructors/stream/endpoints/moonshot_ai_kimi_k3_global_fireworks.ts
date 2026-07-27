import type { FireworksInputConfig } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { WithMoonshotAiKimiK3Config } from "@app/lib/model_constructors/providers/fireworks/models/kimi_k3";
import { toolCallResultMessageToMessage } from "@app/lib/model_constructors/sdk/openai_completions/converters/input/utils";
import { FireworksStream } from "@app/lib/model_constructors/stream/clients/fireworks";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import type {
  BaseToolCallResultMessage,
  Payload,
} from "@app/lib/model_constructors/types/input/messages";
import { MOONSHOT_AI_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";

type KimiK3ToolMessageParam = ChatCompletionToolMessageParam & {
  name: string;
};

function toolCallResultMessageToKimiK3Message(
  message: BaseToolCallResultMessage
): KimiK3ToolMessageParam {
  return {
    ...toolCallResultMessageToMessage(message),
    // Kimi K3 requires names when parallel tool results cannot be matched by order.
    name: message.content.toolName,
  };
}

export class MoonshotAiKimiK3GlobalFireworksStream extends WithMoonshotAiKimiK3Config(
  FireworksStream
) {
  override toolCallResultMessageToMessage =
    toolCallResultMessageToKimiK3Message;

  // https://docs.fireworks.ai/serverless/serving-paths
  override buildRequestPayload(
    payload: Payload,
    config: FireworksInputConfig
  ): ChatCompletionCreateParamsStreaming {
    return {
      ...super.buildRequestPayload(payload, config),
      service_tier: "priority",
    };
  }

  // https://docs.fireworks.ai/serverless/pricing
  static readonly tokenPricing = {
    cacheHit: 0.375,
    standardInput: 3.75,
    standardOutput: 18.75,
  };
  static readonly lab = MOONSHOT_AI_LAB;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
MoonshotAiKimiK3GlobalFireworksStream satisfies StreamEndpointConstructor;
