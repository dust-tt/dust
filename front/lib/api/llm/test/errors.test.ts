import { describe, expect, it } from "vitest";

import { categorizeLLMError } from "@app/lib/api/llm/types/errors";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { CLAUDE_4_SONNET_20250514_MODEL_ID } from "@app/types";

const metadata: LLMClientMetadata = {
  clientId: "anthropic" as const,
  modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
};

function makeError(message: string) {
  return new Error(message);
}

function makeErrorLikeWithStatus(message: string, status: number) {
  // Return a plain object with a message and numeric status to exercise status extraction
  // without mutating or using type assertions.
  return { name: "Error", message, status } as const;
}

function expectCommon(
  info: ReturnType<typeof categorizeLLMError>,
  { type, isRetryable }: { type: string; isRetryable: boolean }
) {
  expect(info.type).toBe(type);
  expect(info.isRetryable).toBe(isRetryable);
  // Message should include client id.
  expect(info.message).toContain(String(metadata.clientId));
}

describe("categorizeLLMError", () => {
  it("rate limit: by status 429", () => {
    const info = categorizeLLMError(
      makeErrorLikeWithStatus("anything", 429),
      metadata
    );
    expectCommon(info, {
      type: "rate_limit_error",
      isRetryable: true,
    });
    expect(info.message.toLowerCase()).toContain("rate limit");
  });

  it("rate limit: by message", () => {
    const info = categorizeLLMError(
      makeError("Too Many Requests from provider"),
      metadata
    );
    expectCommon(info, {
      type: "rate_limit_error",
      isRetryable: true,
    });
  });

  it("overloaded: by status 503", () => {
    const info = categorizeLLMError(
      makeErrorLikeWithStatus("temporary issue", 503),
      metadata
    );
    expectCommon(info, {
      type: "overloaded_error",
      isRetryable: true,
    });
    expect(info.message.toLowerCase()).toContain("overloaded");
  });

  it("overloaded: by message", () => {
    const info = categorizeLLMError(
      makeError("Service Unavailable - capacity reached"),
      metadata
    );
    expectCommon(info, {
      type: "overloaded_error",
      isRetryable: true,
    });
  });

  it("context length exceeded", () => {
    const info = categorizeLLMError(
      makeError("Maximum context length exceeded for this model"),
      metadata
    );
    expectCommon(info, {
      type: "context_length_exceeded",
      isRetryable: false,
    });
  });

  it("authentication: by status 401", () => {
    const info = categorizeLLMError(
      makeErrorLikeWithStatus("Unauthorized", 401),
      metadata
    );
    expectCommon(info, {
      type: "authentication_error",
      isRetryable: false,
    });
  });

  it("authentication: by message (api key)", () => {
    const info = categorizeLLMError(
      makeError("Invalid API key provided"),
      metadata
    );
    expectCommon(info, {
      type: "authentication_error",
      isRetryable: false,
    });
  });

  it("permission: by status 403", () => {
    const info = categorizeLLMError(
      makeErrorLikeWithStatus("Forbidden", 403),
      metadata
    );
    expectCommon(info, {
      type: "permission_error",
      isRetryable: false,
    });
  });

  it("permission: by message", () => {
    const info = categorizeLLMError(
      makeError("Permission denied: not allowed"),
      metadata
    );
    expectCommon(info, {
      type: "permission_error",
      isRetryable: false,
    });
  });

  it("not found: by status 404", () => {
    const info = categorizeLLMError(
      makeErrorLikeWithStatus("anything", 404),
      metadata
    );
    expectCommon(info, {
      type: "not_found_error",
      isRetryable: false,
    });
  });

  it("not found: by message", () => {
    const info = categorizeLLMError(makeError("resource not found"), metadata);
    expectCommon(info, {
      type: "not_found_error",
      isRetryable: false,
    });
  });

  it("invalid request: by status 400", () => {
    const info = categorizeLLMError(
      makeErrorLikeWithStatus("oops", 400),
      metadata
    );
    expectCommon(info, {
      type: "invalid_request_error",
      isRetryable: false,
    });
  });

  it("invalid request: by message", () => {
    const info = categorizeLLMError(
      makeError("Bad Request: validation error"),
      metadata
    );
    expectCommon(info, {
      type: "invalid_request_error",
      isRetryable: false,
    });
  });

  it("network error: by message", () => {
    const info = categorizeLLMError(makeError("ECONNREFUSED"), metadata);
    expectCommon(info, {
      type: "network_error",
      isRetryable: true,
    });
  });

  it("timeout error: by message", () => {
    const info = categorizeLLMError(makeError("Operation timed out"), metadata);
    expectCommon(info, {
      type: "timeout_error",
      isRetryable: true,
    });
  });

  it("stream error: by message", () => {
    const info = categorizeLLMError(makeError("stream interrupted"), metadata);
    expectCommon(info, {
      type: "stream_error",
      isRetryable: true,
    });
  });

  it("server error: by status 500", () => {
    const info = categorizeLLMError(
      makeErrorLikeWithStatus("Internal Server Error", 500),
      metadata
    );
    expectCommon(info, {
      type: "server_error",
      isRetryable: true,
    });
  });

  it("server error: by message", () => {
    const info = categorizeLLMError(
      makeError("An internal server error occurred"),
      metadata
    );
    expectCommon(info, {
      type: "server_error",
      isRetryable: true,
    });
  });

  it("unknown error (default)", () => {
    const info = categorizeLLMError(
      makeError("Something odd happened"),
      metadata
    );
    expectCommon(info, {
      type: "unknown_error",
      isRetryable: false,
    });
  });
});
