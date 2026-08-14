import { WithThinkingMachinesInklingConfig } from "@app/lib/model_constructors/providers/fireworks/models/inkling";
import { FireworksStream } from "@app/lib/model_constructors/stream/clients/fireworks";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import type { SystemTextMessage } from "@app/lib/model_constructors/types/input/messages";
import { THINKING_MACHINES_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";
import type { ChatCompletionSystemMessageParam } from "openai/resources/chat/completions";

export class ThinkingMachinesInklingGlobalFireworksStream extends WithThinkingMachinesInklingConfig(
  FireworksStream
) {
  // Inkling accepts `system` but rejects the OpenAI-specific `developer` role.
  override systemMessageToMessage = (
    message: SystemTextMessage
  ): ChatCompletionSystemMessageParam => ({
    role: "system",
    content: message.content.value,
  });

  // Verified 2026-08-14: https://fireworks.ai/models/fireworks/inkling
  static readonly tokenPricing = {
    cacheHit: 0.17,
    standardInput: 1.0,
    standardOutput: 4.05,
  };

  static readonly lab = THINKING_MACHINES_LAB;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}

ThinkingMachinesInklingGlobalFireworksStream satisfies StreamEndpointConstructor;
