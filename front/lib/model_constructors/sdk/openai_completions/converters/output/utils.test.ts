import { convertToOldEvent } from "@app/lib/api/llm/transitionLLM";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { streamErrorToErrorEvent } from "@app/lib/model_constructors/sdk/openai_completions/converters/output/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "openai";
import { describe, expect, it } from "vitest";

const metadata: EndpointMetadata = {
  lab: "z_ai",
  host: "fireworks",
  region: "global",
  model: "glm-5p2",
};

const llmMetadata: LLMClientMetadata = {
  clientId: "fireworks",
  inferenceProvider: "fireworks",
  inferenceRegion: "global",
  modelId: "accounts/fireworks/models/glm-5p2",
};

describe("streamErrorToErrorEvent", () => {
  it.each([
    [400, "invalid_request_error", "dust"],
    [422, "invalid_request_error", "dust"],
    [401, "authentication_error", "dust"],
    [403, "permission_error", "dust"],
    [404, "not_found_error", "dust"],
    [429, "rate_limit_error", "dust"],
    [503, "overloaded_error", "provider"],
  ] as const)("maps HTTP %i to %s from %s", (status, expectedType, errorSource) => {
    const err = new APIError(status, {}, "http failure", undefined);
    const result = streamErrorToErrorEvent(metadata, err);
    expect(result.content.type).toBe(expectedType);
    expect(result.content.errorSource).toBe(errorSource);
  });

  it("maps a generic 5xx status to server_error from the provider", () => {
    const err = new APIError(500, {}, "kaboom", undefined);
    const result = streamErrorToErrorEvent(metadata, err);
    expect(result.content.type).toBe("server_error");
    expect(result.content.errorSource).toBe("provider");
  });

  // A statusless SSE `APIError` can be a permanent request/model error, not only
  // a transient outage, so it stays a non-retryable unknown_error (attributed to
  // the provider) rather than becoming a retryable server_error.
  it("maps a generic statusless SSE APIError to a non-retryable unknown_error", () => {
    const err = new APIError(
      undefined,
      { message: "generation failed" },
      "generation failed",
      undefined
    );
    const result = streamErrorToErrorEvent(metadata, err);
    expect(result.content.type).toBe("unknown_error");
    expect(result.content.errorSource).toBe("provider");
    expect(convertToOldEvent(result, llmMetadata)).toMatchObject({
      type: "error",
      content: { type: "unknown_error", isRetryable: false },
    });
  });

  it("does not turn a statusless SSE payload with a permanent error code into a retryable server_error", () => {
    const err = new APIError(
      undefined,
      { code: "context_length_exceeded", message: "too many tokens" },
      "too many tokens",
      undefined
    );
    const result = streamErrorToErrorEvent(metadata, err);
    expect(result.content.type).toBe("unknown_error");
    expect(result.content.errorSource).toBe("provider");
    expect(convertToOldEvent(result, llmMetadata)).toMatchObject({
      type: "error",
      content: { type: "unknown_error", isRetryable: false },
    });
  });

  it("maps APIConnectionTimeoutError to a retryable timeout_error without blaming the provider", () => {
    const err = new APIConnectionTimeoutError({ message: "request timed out" });
    const result = streamErrorToErrorEvent(metadata, err);
    expect(result.content.type).toBe("timeout_error");
    expect(result.content.errorSource).toBe("unknown");
    expect(convertToOldEvent(result, llmMetadata)).toMatchObject({
      type: "error",
      content: { type: "timeout_error", isRetryable: true },
    });
  });

  it("maps an unrecognized 4xx status to a Dust invalid_request_error", () => {
    const err = new APIError(418, {}, "teapot", undefined);
    const result = streamErrorToErrorEvent(metadata, err);
    expect(result.content.type).toBe("invalid_request_error");
    expect(result.content.errorSource).toBe("dust");
  });

  it("maps APIConnectionError to a network_error without blaming the provider", () => {
    const err = new APIConnectionError({ message: "connection reset" });
    const result = streamErrorToErrorEvent(metadata, err);
    expect(result.content.type).toBe("network_error");
    expect(result.content.errorSource).toBe("unknown");
    expect(result.content.originalError).toBe(err);
  });

  it("does not attribute a client abort to the provider", () => {
    const result = streamErrorToErrorEvent(
      metadata,
      new APIUserAbortError({ message: "cancelled" })
    );
    expect(result.content.type).toBe("unknown_error");
    expect(result.content.errorSource).toBe("unknown");
  });

  it("maps an undici socket termination to a network_error without blaming the provider", () => {
    const err = new TypeError("terminated", {
      cause: Object.assign(new Error("other side closed"), {
        code: "UND_ERR_SOCKET",
      }),
    });
    const result = streamErrorToErrorEvent(metadata, err);
    expect(result.content.type).toBe("network_error");
    expect(result.content.errorSource).toBe("unknown");
    expect(result.content.message).toContain("UND_ERR_SOCKET");
  });

  it("serializes a Fireworks socket termination as a retryable network error", () => {
    const event = streamErrorToErrorEvent(
      metadata,
      new TypeError("terminated", {
        cause: Object.assign(new Error("other side closed"), {
          code: "UND_ERR_SOCKET",
        }),
      })
    );

    expect(convertToOldEvent(event, llmMetadata)).toMatchObject({
      type: "error",
      content: {
        type: "network_error",
        errorSource: "unknown",
        isRetryable: true,
      },
    });
  });

  it("serializes a client abort as a non-retryable unknown error", () => {
    const event = streamErrorToErrorEvent(
      metadata,
      new APIUserAbortError({ message: "cancelled" })
    );

    expect(convertToOldEvent(event, llmMetadata)).toMatchObject({
      type: "error",
      content: {
        type: "unknown_error",
        errorSource: "unknown",
        isRetryable: false,
      },
    });
  });

  it("does not attribute an arbitrary exception to the provider", () => {
    const result = streamErrorToErrorEvent(
      metadata,
      new SyntaxError("unexpected token")
    );
    expect(result.content.type).toBe("unknown_error");
    expect(result.content.errorSource).toBe("unknown");
  });
});
