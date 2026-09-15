import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { WithAnthropicClaudeOpusFiveConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_five";
import type { AnthropicOpusInputConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_shared_config";
import { BedrockStream } from "@app/lib/model_constructors/stream/clients/bedrock";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

// Claude Opus 5 on the Bedrock `bedrock-mantle` endpoint. Model id
// `anthropic.claude-opus-5`, 1M context / 128k output, adaptive thinking.
// https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5.html
// (verified 2026-09-10)
//
// `region` is GLOBAL: `bedrock-mantle` model ids carry no geo prefix and Bedrock
// routes globally by default ("Global: dynamic routing across all available
// regions... No pricing premium", regional routing being the one that costs 10%
// more).
// https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock#regions
export class AnthropicClaudeOpusFiveGlobalBedrockStream extends WithAnthropicClaudeOpusFiveConfig(
  BedrockStream
) {
  // Verified 2026-09-10 against the model's AWS Marketplace rate card
  // (`bedrock:ListFoundationModelAgreementOffers` →
  // `termDetails.usageBasedPricingTerm`), on the `*_global_standard`
  // dimensions. They match Anthropic's own list prices; the in-region
  // dimensions are 10% higher (5.5 / 27.5 / 0.55 / 6.875 / 11), which is the
  // premium the region note above refers to.
  static readonly tokenPricing = {
    cacheCreated: 6.25,
    // 5m cache write = 1.25x base input; 1h cache write = 2x base input.
    shortCacheCreated: 6.25,
    longCacheCreated: 10.0,
    cacheHit: 0.5,
    standardInput: 5.0,
    standardOutput: 25.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

AnthropicClaudeOpusFiveGlobalBedrockStream satisfies StreamEndpointConstructor<
  MessageCreateParamsNonStreaming,
  BetaRawMessageStreamEvent,
  AnthropicOpusInputConfig
>;
