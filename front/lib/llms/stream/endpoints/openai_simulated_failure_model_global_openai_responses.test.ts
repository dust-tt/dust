import { applyDegradedEndpointCacheUpdate } from "@app/lib/api/assistant/degraded_models";
import {
  getSimulatedFailureModelStatus,
  SIMULATED_FAILURE_MODEL_ENDPOINT,
} from "@app/lib/api/llm/simulated_failure_model";
import { DustOpenAISimulatedFailureModelGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_simulated_failure_model_global_openai_responses";
import { streamErrorToErrorEvent } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { ModelDegradationFactory } from "@app/tests/utils/ModelDegradationFactory";
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const metadata: EndpointMetadata = {
  lab: "openai",
  host: "openai-responses",
  region: "us",
  model: "simulated-failure-model",
};

class TestableSimulatedFailureStream extends DustOpenAISimulatedFailureModelGlobalOpenAIResponsesStream {
  readonly providerCall = vi.fn();

  protected override async *streamFromOpenAI(
    _input: ResponseCreateParamsStreaming
  ): AsyncGenerator<ResponseStreamEvent> {
    this.providerCall();
  }
}

describe("simulated failure model stream", () => {
  beforeEach(async () => {
    await createResourceTest({ role: "admin" });
  });

  afterEach(async () => {
    await ModelDegradationResource.updateDegradedEndpoints([
      { ...SIMULATED_FAILURE_MODEL_ENDPOINT, degraded: false },
    ]);
    applyDegradedEndpointCacheUpdate([
      { modelId: SIMULATED_FAILURE_MODEL_ENDPOINT.modelId, degraded: false },
    ]);
  });

  it("fails before any provider call without mutating degradation", async () => {
    const endpoint = new TestableSimulatedFailureStream({ OPENAI_API_KEY: "" });

    await expect(
      endpoint.streamRaw({ model: "gpt-5.4-mini" }).next()
    ).rejects.toMatchObject({ status: 503 });
    expect(endpoint.providerCall).not.toHaveBeenCalled();
    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      degradation: "none",
    });
  });

  // A `status` field alone proves nothing: the breaker counts an attempt
  // towards its error ratio only once the converter attributes it to the
  // provider, which the status-carrying classifier reaches for SDK errors only.
  it("throws a failure the converter attributes to the provider", async () => {
    const endpoint = new TestableSimulatedFailureStream({ OPENAI_API_KEY: "" });

    const thrown = await endpoint
      .streamRaw({ model: "gpt-5.4-mini" })
      .next()
      .catch((err: unknown) => err);

    expect(streamErrorToErrorEvent(metadata, thrown)).toMatchObject({
      content: { errorSource: "provider", type: "overloaded_error" },
    });
  });

  it("calls the cheap delegate once a degradation row exists", async () => {
    await ModelDegradationFactory.degraded(SIMULATED_FAILURE_MODEL_ENDPOINT);
    const endpoint = new TestableSimulatedFailureStream({ OPENAI_API_KEY: "" });

    await expect(
      endpoint.streamRaw({ model: "gpt-5.4-mini" }).next()
    ).resolves.toMatchObject({ done: true });
    expect(endpoint.providerCall).toHaveBeenCalledOnce();
  });
});
