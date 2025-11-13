import {
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { handleError } from "@app/lib/api/llm/clients/anthropic/utils/errors";
import type { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { CLAUDE_4_SONNET_20250514_MODEL_ID } from "@app/types";

const metadata: LLMClientMetadata = {
  clientId: "anthropic" as const,
  modelId: CLAUDE_4_SONNET_20250514_MODEL_ID,
};

function makeHeaders() {
  return new Headers([["request-id", "req_123"]]);
}

describe("handleError (Anthropic)", () => {
  it("maps RateLimitError (429)", () => {
    const err = new RateLimitError(
      429,
      { message: "Too Many Requests" },
      undefined,
      makeHeaders()
    );
    const event = handleError(err, metadata) as EventError;
    expect(event.type).toBe("error");
    expect(event.metadata).toEqual(metadata);
    expect(event.content.message.toLowerCase()).toContain("rate limit");
    expect(event.content.message).toContain("anthropic");
  });

  it("maps BadRequestError (400)", () => {
    const err = new BadRequestError(
      400,
      { message: "Bad Request" },
      undefined,
      makeHeaders()
    );
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("invalid request");
  });

  it("maps AuthenticationError (401)", () => {
    const err = new AuthenticationError(
      401,
      { message: "Unauthorized" },
      undefined,
      makeHeaders()
    );
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("authentication");
  });

  it("maps PermissionDeniedError (403)", () => {
    const err = new PermissionDeniedError(
      403,
      { message: "Forbidden" },
      undefined,
      makeHeaders()
    );
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("permission");
  });

  it("maps NotFoundError (404)", () => {
    const err = new NotFoundError(
      404,
      { message: "Not Found" },
      undefined,
      makeHeaders()
    );
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("not found");
  });

  it("maps InternalServerError (500)", () => {
    const err = new InternalServerError(
      500,
      { message: "Internal Server Error" },
      undefined,
      makeHeaders()
    );
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("server error");
  });
});
