import { DustModel } from "@app/lib/model_constructors/dust-model";
import type { inputConfigSchema } from "@app/lib/model_constructors/types/config";
import {
  ORDERED_REASONING_EFFORTS,
  type ReasoningEffort,
} from "@app/lib/model_constructors/types/config";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";

import type {
  ErrorEvent,
  LargeLanguageModelResponseEvent,
  TokenUsageContent,
} from "@app/lib/model_constructors/types/events";
import type { Payload } from "@app/lib/model_constructors/types/messages";
import type { ModelEndpoint } from "@app/lib/model_constructors/types/model-endpoints";
import type { TokenPricing } from "@app/lib/model_constructors/types/pricing";
import { computeUsageCost } from "@app/lib/model_constructors/utils/computeUsageCost";
import type { z } from "zod";
export abstract class LargeLanguageModel<
  I = unknown,
  O = unknown,
> extends DustModel {
  abstract modelEndpoint: ModelEndpoint;
  abstract contextWindow: number;
  abstract tokenPricing: TokenPricing;
  abstract maxOutputTokens: number;
  abstract configSchema: z.ZodType<z.infer<typeof inputConfigSchema>>;

  credentials: Credentials;

  constructor(credentials: Credentials) {
    super();
    this.credentials = credentials;
  }

  abstract buildRequestPayload(
    input: Payload,
    config: z.infer<typeof this.configSchema>
  ): I;
  abstract streamRaw(input: I): AsyncGenerator<O>;
  abstract rawOutputToEvents(
    raw: AsyncGenerator<O>
  ): AsyncGenerator<LargeLanguageModelResponseEvent>;
  abstract streamErrorToEvent(error: unknown): ErrorEvent;

  isConfigValid(
    config: z.infer<typeof inputConfigSchema>
  ): config is z.infer<typeof this.configSchema> {
    return this.configSchema.safeParse(config).success;
  }

  async *stream(
    input: Payload,
    config: z.infer<typeof this.configSchema>
  ): AsyncGenerator<LargeLanguageModelResponseEvent> {
    const configValidationResult = this.configSchema.safeParse(config);

    if (!configValidationResult.success) {
      yield {
        type: "error",
        content: {
          type: "input_configuration_error",
          message: "Configuration is invalid.",
          originalError: configValidationResult.error.format(),
        },
        metadata: this.modelEndpoint,
      };
      return;
    }

    const payload = this.buildRequestPayload(
      input,
      configValidationResult.data
    );

    try {
      const events = await this.streamRaw(payload);
      yield* this.rawOutputToEvents(events);
    } catch (e) {
      yield this.streamErrorToEvent(e);
    }

    return;
  }

  computeUsageCost(usage: TokenUsageContent): number {
    return computeUsageCost(usage, this.tokenPricing);
  }

  get supportedReasoningEfforts(): ReasoningEffort[] {
    return ORDERED_REASONING_EFFORTS.filter(
      (effort) => this.configSchema.safeParse({ reasoning: { effort } }).success
    );
  }
}
