import {
  clearSimulatedFailureModelHealthWindow,
  getSimulatedFailureModelStatus,
  seedSimulatedFailureModelHealthWindow,
} from "@app/lib/api/llm/simulated_failure_model";
import { DustOpenAISimulatedFailureModelGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_simulated_failure_model_global_openai_responses";
import { streamErrorToErrorEvent } from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { redisMock } from "@app/tests/utils/mocks/redis";
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
    yield { type: "response.created" } as ResponseStreamEvent;
  }
}

describe("simulated failure model stream", () => {
  beforeEach(async () => {
    await createResourceTest({ role: "admin" });
    redisMock.reset();
  });

  afterEach(async () => {
    await clearSimulatedFailureModelHealthWindow();
    redisMock.reset();
  });

  it("delegates to the working model while healthy", async () => {
    const endpoint = new TestableSimulatedFailureStream({ OPENAI_API_KEY: "" });

    await endpoint.streamRaw({ model: "gpt-5.4-mini" }).next();

    expect(endpoint.providerCall).toHaveBeenCalledOnce();
  });

  // GPT-5.4 Mini rejects explicit breakpoints (supported from 5.6). The
  // healthy path remaps to Mini, so the request must use Mini's contract.
  it("does not send prompt cache breakpoints on the Mini request", () => {
    const endpoint = new DustOpenAISimulatedFailureModelGlobalOpenAIResponsesStream(
      { OPENAI_API_KEY: "" }
    );

    const request = endpoint.buildRequestPayload(
      {
        conversation: {
          system: [
            {
              role: "system",
              type: "text",
              content: { value: "sys" },
              cache: "short",
            },
          ],
          messages: [
            {
              role: "user",
              type: "text",
              content: { value: "hi" },
              cache: "short",
            },
          ],
        },
      },
      {}
    );

    expect(request.model).toBe("gpt-5.4-mini");
    expect(JSON.stringify(request)).not.toContain("prompt_cache_breakpoint");
  });

  it("fails before delegation without mutating degradation directly", async () => {
    await seedSimulatedFailureModelHealthWindow();
    const endpoint = new TestableSimulatedFailureStream({ OPENAI_API_KEY: "" });

    await expect(
      endpoint.streamRaw({ model: "gpt-5.4-mini" }).next()
    ).rejects.toMatchObject({ status: 503 });
    expect(endpoint.providerCall).not.toHaveBeenCalled();
    await expect(getSimulatedFailureModelStatus()).resolves.toMatchObject({
      failureEnabled: true,
      degradation: "none",
    });
  });

  // A `status` field alone proves nothing: the breaker counts an attempt
  // towards its error ratio only once the converter attributes it to the
  // provider, which the status-carrying classifier reaches for SDK errors only.
  it("throws a failure the converter attributes to the provider", async () => {
    await seedSimulatedFailureModelHealthWindow();
    const endpoint = new TestableSimulatedFailureStream({ OPENAI_API_KEY: "" });

    const thrown = await endpoint
      .streamRaw({ model: "gpt-5.4-mini" })
      .next()
      .catch((err: unknown) => err);

    expect(streamErrorToErrorEvent(metadata, thrown)).toMatchObject({
      content: { errorSource: "provider", type: "overloaded_error" },
    });
  });
});
