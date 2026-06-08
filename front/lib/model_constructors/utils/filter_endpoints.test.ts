// @vitest-environment node

import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import { AnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_anthropic_global_claude_sonnet_four_dot_six";
import type { Filter } from "@app/lib/model_constructors/types/filter";
import {
  CLAUDE_SONNET_4_6_MODEL_ID,
  GPT_5_4_MODEL_ID,
  type ModelId,
} from "@app/lib/model_constructors/types/model_ids";
import {
  AGENT_PLATFORM_API,
  ANTHROPIC_API,
  OPENAI_RESPONSES_API,
  type ProviderApi,
} from "@app/lib/model_constructors/types/provider_apis";
import {
  ANTHROPIC_PROVIDER_ID,
  OPENAI_PROVIDER_ID,
  type ProviderId,
} from "@app/lib/model_constructors/types/provider_ids";
import {
  EUROPE,
  GLOBAL,
  type Region,
  US,
} from "@app/lib/model_constructors/types/regions";
import { getFilteredEndpoints } from "@app/lib/model_constructors/utils/filter_endpoints";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { describe, expect, it } from "vitest";

// Builds a fake stream endpoint constructor exposing only the static config that
// `getFilteredEndpoints` / `matchFilter` read. Boilerplate config (schema,
// pricing, capabilities) is borrowed from a real endpoint so the fake satisfies
// `StreamEndpointConstructor` without re-declaring zod schemas. The inference
// methods are stubbed since the tests never instantiate or stream.
interface FakeEndpointOverrides {
  region: Region;
  providerId?: ProviderId;
  api?: ProviderApi;
  modelId?: ModelId;
  byok?: boolean;
  featureFlags?: WhitelistableFeature[];
}

function makeEndpoint({
  region,
  providerId = ANTHROPIC_PROVIDER_ID,
  api = ANTHROPIC_API,
  modelId = CLAUDE_SONNET_4_6_MODEL_ID,
  byok = true,
  featureFlags = [],
}: FakeEndpointOverrides): StreamEndpointConstructor {
  const real = AnthropicGlobalClaudeSonnetFourDotSixStream;

  // Extends the abstract `StreamEndpoint` (not a concrete leaf) so each fake can
  // pin its own `region`/`api`/... — a concrete leaf's statics are literal types
  // (e.g. `region: "global"`) that a subclass cannot override.
  class FakeStreamEndpoint extends StreamEndpoint<unknown, unknown> {
    static readonly providerId = providerId;
    static readonly api = api;
    static readonly modelId = modelId;
    static readonly region = region;
    static readonly byok = byok;
    static readonly featureFlags = featureFlags;

    static readonly displayName = real.displayName;
    static readonly description = real.description;
    static readonly contextSize = real.contextSize;
    static readonly maxOutputTokens = real.maxOutputTokens;
    static readonly defaultReasoningEffort = real.defaultReasoningEffort;
    static readonly configSchema = real.configSchema;
    static readonly supportedReasoningEfforts = real.supportedReasoningEfforts;
    static readonly tokenPricing = real.tokenPricing;
    static readonly id = this.buildId();

    // The tests never instantiate or stream; inference is irrelevant here.
    buildRequestPayload(): unknown {
      throw new Error("not implemented");
    }
    async *streamRaw(): AsyncGenerator<unknown> {
      throw new Error("not implemented");
    }
    async *rawStreamOutputToEvents(): AsyncGenerator<never> {
      throw new Error("not implemented");
    }
  }

  return FakeStreamEndpoint;
}

// A filter that matches every fake endpoint built with the defaults above.
function baseFilter(overrides: Partial<Filter> = {}): Filter {
  return { byok: true, featureFlags: [], ...overrides };
}

// Maps endpoints to their regions for concise ordering assertions.
function regionsOf(endpoints: StreamEndpointConstructor[]): Region[] {
  return endpoints.map((e) => e.region);
}

describe("getFilteredEndpoints", () => {
  describe("filtering", () => {
    it("returns an empty array when given no endpoints", () => {
      expect(getFilteredEndpoints([], baseFilter())).toEqual([]);
    });

    it("returns an empty array when nothing matches the filter", () => {
      const endpoints = [makeEndpoint({ region: US })];

      expect(
        getFilteredEndpoints(endpoints, baseFilter({ regions: [EUROPE] }))
      ).toEqual([]);
    });

    it("excludes endpoints whose region is not in the regions filter", () => {
      const us = makeEndpoint({ region: US });
      const europe = makeEndpoint({ region: EUROPE });
      const global = makeEndpoint({ region: GLOBAL });

      const result = getFilteredEndpoints(
        [us, europe, global],
        baseFilter({ regions: [US, GLOBAL] })
      );

      expect(result).toEqual([us, global]);
    });

    it("filters by providerIds", () => {
      const anthropic = makeEndpoint({
        region: US,
        providerId: ANTHROPIC_PROVIDER_ID,
      });
      const openai = makeEndpoint({
        region: US,
        providerId: OPENAI_PROVIDER_ID,
      });

      const result = getFilteredEndpoints(
        [anthropic, openai],
        baseFilter({ providerIds: [OPENAI_PROVIDER_ID] })
      );

      expect(result).toEqual([openai]);
    });

    it("filters by modelIds", () => {
      const sonnet = makeEndpoint({
        region: US,
        modelId: CLAUDE_SONNET_4_6_MODEL_ID,
      });
      const gpt = makeEndpoint({ region: US, modelId: GPT_5_4_MODEL_ID });

      const result = getFilteredEndpoints(
        [sonnet, gpt],
        baseFilter({ modelIds: [GPT_5_4_MODEL_ID] })
      );

      expect(result).toEqual([gpt]);
    });

    it("filters by apis", () => {
      const anthropicApi = makeEndpoint({ region: US, api: ANTHROPIC_API });
      const agentPlatform = makeEndpoint({
        region: US,
        api: AGENT_PLATFORM_API,
      });
      const openaiApi = makeEndpoint({ region: US, api: OPENAI_RESPONSES_API });

      const result = getFilteredEndpoints(
        [anthropicApi, agentPlatform, openaiApi],
        baseFilter({ apis: [AGENT_PLATFORM_API, OPENAI_RESPONSES_API] })
      );

      expect(result).toEqual([agentPlatform, openaiApi]);
    });

    it("does not restrict by byok when the filter byok is not set", () => {
      const byok = makeEndpoint({ region: US, byok: true });
      const managed = makeEndpoint({ region: US, byok: false });

      // `byok: false` (and `undefined`) means "no byok restriction", so both
      // byok and non-byok endpoints match.
      expect(
        getFilteredEndpoints([byok, managed], baseFilter({ byok: false }))
      ).toEqual([byok, managed]);
      expect(
        getFilteredEndpoints([byok, managed], baseFilter({ byok: undefined }))
      ).toEqual([byok, managed]);
    });

    it("excludes non-byok endpoints when the filter requires byok", () => {
      const byok = makeEndpoint({ region: US, byok: true });
      const managed = makeEndpoint({ region: US, byok: false });

      const result = getFilteredEndpoints(
        [byok, managed],
        baseFilter({ byok: true })
      );

      expect(result).toEqual([byok]);
    });

    it("excludes endpoints whose feature flags are not all enabled", () => {
      const gated = makeEndpoint({
        region: US,
        featureFlags: ["use_new_llm_router"],
      });
      const ungated = makeEndpoint({ region: US, featureFlags: [] });

      const withoutFlag = getFilteredEndpoints(
        [gated, ungated],
        baseFilter({ featureFlags: [] })
      );
      expect(withoutFlag).toEqual([ungated]);

      const withFlag = getFilteredEndpoints(
        [gated, ungated],
        baseFilter({ featureFlags: ["use_new_llm_router"] })
      );
      expect(withFlag).toEqual([gated, ungated]);
    });
  });

  describe("region ordering", () => {
    it("returns matched endpoints unchanged when regions is undefined", () => {
      const us = makeEndpoint({ region: US });
      const europe = makeEndpoint({ region: EUROPE });
      const global = makeEndpoint({ region: GLOBAL });

      const result = getFilteredEndpoints([us, europe, global], baseFilter());

      expect(result).toEqual([us, europe, global]);
    });

    it("matches nothing when regions is an empty array", () => {
      const us = makeEndpoint({ region: US });
      const europe = makeEndpoint({ region: EUROPE });

      // `matchFilter` treats an empty `regions` array as "no region allowed"
      // (`[].includes(region)` is always false), so everything is filtered out
      // before the ordering step is reached.
      const result = getFilteredEndpoints(
        [us, europe],
        baseFilter({ regions: [] })
      );

      expect(result).toEqual([]);
    });

    it("orders endpoints by the position of their region in the filter", () => {
      const us = makeEndpoint({ region: US });
      const europe = makeEndpoint({ region: EUROPE });
      const global = makeEndpoint({ region: GLOBAL });

      // Provided out of region order; expect them sorted to match the filter.
      const result = getFilteredEndpoints(
        [global, us, europe],
        baseFilter({ regions: [US, EUROPE, GLOBAL] })
      );

      expect(regionsOf(result)).toEqual([US, EUROPE, GLOBAL]);
    });

    it("groups regions in filter order while preserving the input order within each region", () => {
      const us1 = makeEndpoint({ region: US, api: ANTHROPIC_API });
      const europe1 = makeEndpoint({ region: EUROPE, api: ANTHROPIC_API });
      const us2 = makeEndpoint({ region: US, api: AGENT_PLATFORM_API });
      const europe2 = makeEndpoint({ region: EUROPE, api: AGENT_PLATFORM_API });

      const result = getFilteredEndpoints(
        [europe1, us1, europe2, us2],
        baseFilter({ regions: [US, EUROPE] })
      );

      // US endpoints come first, then Europe; within each region the original
      // input order is preserved (us1 before us2, europe1 before europe2).
      expect(result).toEqual([us1, us2, europe1, europe2]);
    });

    it("preserves the relative order of endpoints within the same region (stable sort)", () => {
      const us1 = makeEndpoint({ region: US, api: ANTHROPIC_API });
      const us2 = makeEndpoint({ region: US, api: AGENT_PLATFORM_API });
      const us3 = makeEndpoint({ region: US, api: OPENAI_RESPONSES_API });

      const result = getFilteredEndpoints(
        [us1, us2, us3],
        baseFilter({ regions: [US] })
      );

      expect(result).toEqual([us1, us2, us3]);
    });

    it("does not mutate the input array", () => {
      const us = makeEndpoint({ region: US });
      const europe = makeEndpoint({ region: EUROPE });
      const input = [europe, us];
      const inputCopy = [...input];

      getFilteredEndpoints(input, baseFilter({ regions: [US, EUROPE] }));

      expect(input).toEqual(inputCopy);
    });
  });
});
