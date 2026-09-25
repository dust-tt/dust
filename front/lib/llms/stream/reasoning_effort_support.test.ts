import { DUST_STREAM_ENDPOINTS } from "@app/lib/llms/stream";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { ORDERED_REASONING_EFFORTS } from "@app/lib/model_constructors/types/reasoning_efforts";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

function effortSentToProvider(
  endpoint: DustStreamEndpointConstructor,
  effort: ReasoningEffort
): ReasoningEffort | null {
  const config: InputConfig = { reasoning: { effort } };
  const parsers = endpoint.configParsers ?? [];
  const result = endpoint.configSchema.safeParse(
    parsers.reduce((acc, parser) => parser(acc), config)
  );
  if (!result.success) {
    return null;
  }
  return result.data.reasoning?.effort ?? "none";
}

describe.each(Object.values(DUST_STREAM_ENDPOINTS))("$id", (endpoint) => {
  it.each(
    ORDERED_REASONING_EFFORTS
  )("supports %s exactly when the provider receives that same effort", (effort) => {
    const isSupported = endpoint.modelConfig.supportedReasoningEfforts[effort];

    expect(isSupported).toBe(effortSentToProvider(endpoint, effort) === effort);
  });

  it("defaults to a supported effort", () => {
    const { defaultReasoningEffort, supportedReasoningEfforts } =
      endpoint.modelConfig;

    expect(supportedReasoningEfforts[defaultReasoningEffort]).toBe(true);
  });

  it("defaults to the effort the provider documents as its default", () => {
    const providerDefault = endpoint.configSchema.parse({}).reasoning?.effort;

    expect(endpoint.modelConfig.defaultReasoningEffort).toBe(
      providerDefault ?? "none"
    );
  });
});
