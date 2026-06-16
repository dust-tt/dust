import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { DustAnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import type { Where, WorkspaceFilter } from "@app/lib/llms/stream/types/filter";
import { isEndpointAvailable } from "@app/lib/llms/stream/utils/is_endpoint_available";
import type { StreamEndpointId } from "@app/lib/model_constructors/stream";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export const DUST_STREAM_ENDPOINTS = {
  [DustAnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    DustAnthropicGlobalClaudeSonnetFourDotSixStream,
  [DustAgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    DustAgentPlatformEuropeClaudeSonnetFourDotSixStream,
} as const satisfies Record<StreamEndpointId, DustStreamEndpointConstructor>;

export function getStreamEndpoints(
  workspaceConfiguration: {
    featureFlags: WhitelistableFeature[];
    enterprise: boolean;
  },
  inputCondition: Where<WorkspaceFilter>
) {
  return Object.values(DUST_STREAM_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
