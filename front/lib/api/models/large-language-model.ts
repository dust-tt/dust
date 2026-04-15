import type { inputConfigSchema } from "@app/lib/api/models/types/config";
import type { Credentials } from "@app/lib/api/models/types/credentials";

import type {
  ErrorEvent,
  LargeLanguageModelResponseEvent,
  TokenUsageContent,
} from "@app/lib/api/models/types/events";
import type { Payload } from "@app/lib/api/models/types/messages";
import type { TokenPricing } from "@app/lib/api/models/types/pricing";
import type { Model } from "@app/lib/api/models/types/providers";
import { computeUsageCost } from "@app/lib/api/models/utils/computeUsageCost";
import { getIdFromModel } from "@app/lib/api/models/utils/getIdFromModel";
import type { z } from "zod";

export abstract class LargeLanguageModel<I = unknown, O = unknown> {
  abstract model: Model;
  abstract contextWindow: number;
  abstract tokenPricing: TokenPricing;
  abstract maxOutputTokens: number;
  abstract configSchema: z.ZodType<z.infer<typeof inputConfigSchema>>;

  credentials: Credentials;

  constructor(credentials: Credentials) {
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
        metadata: this.model,
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

  get modelId() {
    return this.model.modelId;
  }
  get providerId() {
    return this.model.providerId;
  }
  get id() {
    return getIdFromModel(this.model);
  }
}
