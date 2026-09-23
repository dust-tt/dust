import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAnthropicClaudeOpusFiveGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_five_global_anthropic";
import { DustAnthropicClaudeOpusFourDotEightGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_eight_global_anthropic";
import { DustAnthropicClaudeOpusFourDotSevenGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_seven_global_anthropic";
import { DustAnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_six_eu_agent_platform";
import { DustAnthropicClaudeOpusFourDotSixGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_six_global_anthropic";
import { DustOpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_sol_global_openai_responses";
import { DustOpenAIGptSixAstraGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_six_astra_global_openai_responses";
import { DustOpenAIGptSixSolGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_six_sol_global_openai_responses";
import { isEndpointAvailable } from "@app/lib/llms/stream/utils/is_endpoint_available";
import type { WorkspaceConfig } from "@app/lib/llms/types/filter";
import { describe, expect, it } from "vitest";

const NO_ENTITLEMENT: WorkspaceConfig = {
  featureFlags: [],
  isEnterprise: true,
  isCreditPriced: false,
  isAdvancedModels: false,
};

function routes(
  endpoint: DustStreamEndpointConstructor,
  overrides: Partial<WorkspaceConfig>
) {
  return isEndpointAvailable(endpoint, { ...NO_ENTITLEMENT, ...overrides }, {});
}

const PREMIUM_ENDPOINTS = [
  {
    name: "Opus 4.6",
    endpoint: DustAnthropicClaudeOpusFourDotSixGlobalAnthropicStream,
  },
  {
    name: "Opus 4.7",
    endpoint: DustAnthropicClaudeOpusFourDotSevenGlobalAnthropicStream,
  },
  {
    name: "Opus 4.8",
    endpoint: DustAnthropicClaudeOpusFourDotEightGlobalAnthropicStream,
  },
  {
    name: "Opus 5",
    endpoint: DustAnthropicClaudeOpusFiveGlobalAnthropicStream,
  },
  {
    name: "GPT-6 Astra",
    endpoint: DustOpenAIGptSixAstraGlobalOpenAIResponsesStream,
  },
  {
    name: "GPT-5.6 Sol",
    endpoint: DustOpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream,
  },
  {
    name: "GPT-6 Sol",
    endpoint: DustOpenAIGptSixSolGlobalOpenAIResponsesStream,
  },
] as const;

describe("premium model endpoints route on plan entitlement only", () => {
  it.each(PREMIUM_ENDPOINTS)("$name routes credit-priced plans", ({
    endpoint,
  }) => {
    expect(routes(endpoint, { isCreditPriced: true })).toBe(true);
  });

  it.each(PREMIUM_ENDPOINTS)("$name routes plans with advanced-model access", ({
    endpoint,
  }) => {
    expect(routes(endpoint, { isAdvancedModels: true })).toBe(true);
  });

  it.each(
    PREMIUM_ENDPOINTS
  )("$name does not route a plan with neither entitlement", ({ endpoint }) => {
    expect(routes(endpoint, {})).toBe(false);
  });

  it("vetoes GPT-6 Astra when its kill switch is on, whatever the plan", () => {
    expect(
      routes(DustOpenAIGptSixAstraGlobalOpenAIResponsesStream, {
        isCreditPriced: true,
        featureFlags: ["disable_gpt_6_astra"],
      })
    ).toBe(false);
  });

  it("requires both regional hosting and entitlement on eu agent-platform", () => {
    const endpoint = DustAnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream;

    // Hosting term granted by the flag, entitlement term by the plan.
    expect(
      routes(endpoint, {
        featureFlags: ["use_vertex_for_supported_models"],
        isAdvancedModels: true,
      })
    ).toBe(true);
    // Entitled but not hosted regionally.
    expect(routes(endpoint, { isAdvancedModels: true })).toBe(false);
    // Credit-priced satisfies both terms at once.
    expect(routes(endpoint, { isCreditPriced: true })).toBe(true);
  });
});
