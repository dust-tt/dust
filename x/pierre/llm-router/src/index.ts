import type { z } from "zod";

import type { inputConfigSchema, ReasoningEffort } from "@/types/config";
import type {
  LargeLanguageModelResponseEventWithMetadata,
  TokenUsageContent,
} from "@/types/events";
import type { Payload } from "@/types/messages";
import type { TokenPricing } from "@/types/pricing";
import type { LargeLanguageModelId, Model } from "@/types/providers";
import { computeUsageCost } from "@/utils/computeUsageCost";

export abstract class LargeLanguageModel<I, O> {
  abstract model: Model;
  abstract contextWindow: number;
  abstract tokenPricing: TokenPricing;
  abstract maxOutputTokens: number;
  abstract configSchema: z.ZodType<z.infer<typeof inputConfigSchema>>;

  abstract buildRequestPayload(
    input: Payload,
    config: z.infer<typeof this.configSchema>,
  ): I;
  abstract streamRaw(input: I): AsyncGenerator<O>;
  abstract rawOutputToEvents(
    raw: AsyncGenerator<O>,
  ): AsyncGenerator<LargeLanguageModelResponseEventWithMetadata>;

  isConfigValid(
    config: z.infer<typeof inputConfigSchema>,
  ): config is z.infer<typeof this.configSchema> {
    return this.configSchema.safeParse(config).success;
  }

  async *stream(
    input: Payload,
    config: z.infer<typeof this.configSchema>,
  ): AsyncGenerator<LargeLanguageModelResponseEventWithMetadata> {
    const configValidationResult = this.configSchema.safeParse(config);

    if (!configValidationResult.success) {
      yield {
        type: "error",
        content: {
          type: "input_configuration",
          message: configValidationResult.error.message,
        },
        metadata: this.model,
      };
      return;
    }

    const payload = this.buildRequestPayload(
      input,
      configValidationResult.data,
    );

    try {
      const events = await this.streamRaw(payload);
      yield* this.rawOutputToEvents(events);
    } catch (e) {
      yield {
        type: "error" as const,
        content: {
          type: "stream" as const,
          message: e instanceof Error ? e.message : String(e),
        },
        metadata: this.model,
      };
    }

    return;
  }

  computeUsageCost(usage: TokenUsageContent): number {
    return computeUsageCost(usage, this.tokenPricing);
  }

  // Null meaning it does not support reasoning
  abstract getSupportedReasoningEfforts(): ReasoningEffort[] | null;

  get modelId() {
    return this.model.modelId;
  }
  get providerId() {
    return this.model.providerId;
  }
  get id() {
    return `${this.model.providerId}/${this.model.modelId}` as LargeLanguageModelId;
  }
}
