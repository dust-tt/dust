// @vitest-environment node

import assert from "node:assert";

import {
  createCustomStreamEndpoint,
  validateCustomModelEndpoint,
} from "@app/lib/llms/stream/custom_endpoints";
import { isEndpointAvailable } from "@app/lib/llms/stream/utils/is_endpoint_available";
import type { WorkspaceConfig } from "@app/lib/llms/types/filter";
import { CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import type { CustomModelEndpointType } from "@app/types/assistant/models/custom_models";
import {
  CUSTOM_MODEL_FEATURE_FLAG,
  CustomModelSchema,
} from "@app/types/assistant/models/custom_models";
import { describe, expect, it } from "vitest";

const ENDPOINT: CustomModelEndpointType = {
  lab: "anthropic",
  host: "anthropic",
  region: "global",
  maxOutputTokens: 64_000,
  tokenPricing: { standardInput: 4, standardOutput: 20, cacheHit: 0.2 },
  input: {
    reasoningEfforts: ["low", "medium", "high"],
    defaultReasoningEffort: "medium",
    supportsForcedTool: false,
  },
};

const WORKSPACE: WorkspaceConfig = {
  featureFlags: [],
  isEnterprise: true,
  isCreditPriced: false,
  isAdvancedModels: true,
};

// Reuses a known model config: the factory only accepts ids present in `MODELS`, and the
// committed generated file has no custom ids.
function createEndpoint(endpoint: CustomModelEndpointType = ENDPOINT) {
  const streamEndpoint = createCustomStreamEndpoint({
    modelConfig: CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG,
    endpoint,
  });
  assert(streamEndpoint.isOk(), "expected the custom endpoint to be created");
  return streamEndpoint.value;
}

describe("createCustomStreamEndpoint on the Anthropic host", () => {
  it("builds an Anthropic endpoint on explicit global inference", async () => {
    const Endpoint = createEndpoint();
    const endpoint = new Endpoint({ ANTHROPIC_API_KEY: "test" });

    const payload = await endpoint.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      Endpoint.configSchema.parse({})
    );

    expect(Endpoint.id).toBe("anthropic/claude-opus-5-5/global/anthropic");
    expect(payload).toMatchObject({
      model: "claude-opus-5-5",
      inference_geo: "global",
    });
  });

  it("defaults to the endpoint's reasoning effort and rejects efforts outside it", () => {
    const { configSchema } = createEndpoint();

    expect(configSchema.parse({}).reasoning).toEqual({ effort: "medium" });
    expect(
      configSchema.safeParse({ reasoning: { effort: "maximal" } }).success
    ).toBe(false);
  });

  it("rejects a forced tool unless the endpoint supports it", () => {
    const forced = { forceTool: "search", reasoning: { effort: "none" } };

    expect(createEndpoint().configSchema.safeParse(forced).success).toBe(false);
    expect(
      createEndpoint({
        ...ENDPOINT,
        input: {
          ...ENDPOINT.input,
          reasoningEfforts: ["none", "medium"],
          supportsForcedTool: true,
        },
      }).configSchema.safeParse(forced).success
    ).toBe(true);
  });

  it("is only available to workspaces with the custom model flag", () => {
    const Endpoint = createEndpoint();

    expect(isEndpointAvailable(Endpoint, WORKSPACE, {})).toBe(false);
    expect(
      isEndpointAvailable(
        Endpoint,
        { ...WORKSPACE, featureFlags: [CUSTOM_MODEL_FEATURE_FLAG] },
        {}
      )
    ).toBe(true);
  });
});

describe("validateCustomModelEndpoint", () => {
  it.each<[string, CustomModelEndpointType]>([
    ["a host without a custom factory", { ...ENDPOINT, host: "fireworks" }],
    ["a lab the Anthropic API cannot serve", { ...ENDPOINT, lab: "openai" }],
    [
      "a region the Anthropic API does not offer",
      { ...ENDPOINT, region: "eu" },
    ],
    ["a US-pinned region", { ...ENDPOINT, region: "us" }],
    [
      "an effort Anthropic does not support",
      {
        ...ENDPOINT,
        input: { ...ENDPOINT.input, reasoningEfforts: ["minimal", "medium"] },
      },
    ],
    [
      "a forced tool without a none effort",
      { ...ENDPOINT, input: { ...ENDPOINT.input, supportsForcedTool: true } },
    ],
  ])("rejects %s", (_, endpoint) => {
    expect(validateCustomModelEndpoint(endpoint).isErr()).toBe(true);
  });

  it("accepts a supported Anthropic endpoint", () => {
    expect(validateCustomModelEndpoint(ENDPOINT).isOk()).toBe(true);
  });
});

describe("CustomModelSchema", () => {
  const endpoint = ENDPOINT;
  const entry = {
    modelConfig: {
      ...CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG,
      useEapKey: true,
      availableIfOneOf: { featureFlag: CUSTOM_MODEL_FEATURE_FLAG },
    },
    endpoint,
  };

  it("accepts a flagged model", () => {
    expect(CustomModelSchema.safeParse(entry).success).toBe(true);
  });

  it("accepts a model on the Dust-managed key", () => {
    expect(
      CustomModelSchema.safeParse({
        ...entry,
        modelConfig: { ...entry.modelConfig, useEapKey: false },
      }).success
    ).toBe(true);
  });

  it("rejects a model that is not gated behind the custom model flag", () => {
    expect(
      CustomModelSchema.safeParse({
        ...entry,
        modelConfig: { ...entry.modelConfig, availableIfOneOf: undefined },
      }).success
    ).toBe(false);
  });

  it("rejects a model config field it does not know", () => {
    expect(
      CustomModelSchema.safeParse({
        ...entry,
        modelConfig: { ...entry.modelConfig, thinkingBudget: 1024 },
      }).success
    ).toBe(false);
  });

  it("rejects a default effort outside the supported efforts", () => {
    expect(
      CustomModelSchema.safeParse({
        ...entry,
        endpoint: {
          ...endpoint,
          input: { ...endpoint.input, defaultReasoningEffort: "maximal" },
        },
      }).success
    ).toBe(false);
  });
});
