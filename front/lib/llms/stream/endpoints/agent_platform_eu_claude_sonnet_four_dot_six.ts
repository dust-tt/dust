import { WithDustClaudeSonnetFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";

export class DustAgentPlatformEuropeClaudeSonnetFourDotSixStream extends WithDustClaudeSonnetFourDotSixConfig(
  AgentPlatformEuropeClaudeSonnetFourDotSixStream
) {}

defineDustStreamEndpoint(DustAgentPlatformEuropeClaudeSonnetFourDotSixStream);
