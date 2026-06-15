import { WithAnthropicClaudeSonnetFourDotSixConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_sonnet_four_dot_six";
import { AgentPlatformStream } from "@app/lib/model_constructors/stream/clients/agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";

export class AgentPlatformEuropeClaudeSonnetFourDotSixStream extends WithAnthropicClaudeSonnetFourDotSixConfig(
  AgentPlatformStream
) {
  // https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing#europe-west1
  static readonly tokenPricing = {
    cacheCreated: 4.13,
    cacheHit: 0.33,
    standardInput: 3.3,
    standardOutput: 16.5,
  };
  static readonly region = "eu";
  static readonly regionalEndpoint = "europe-west1";

  static readonly id = this.buildId();
}

AgentPlatformEuropeClaudeSonnetFourDotSixStream satisfies StreamEndpointConstructor;
