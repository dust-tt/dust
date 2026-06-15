import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { DustAnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import type { StreamEndpointId } from "@app/lib/model_constructors/stream";

export const DUST_STREAM_ENDPOINTS = {
  [DustAnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    DustAnthropicGlobalClaudeSonnetFourDotSixStream,
  [DustAgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    DustAgentPlatformEuropeClaudeSonnetFourDotSixStream,
} as const satisfies Record<StreamEndpointId, DustStreamEndpointConstructor>;
