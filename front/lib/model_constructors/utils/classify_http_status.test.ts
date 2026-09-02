import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import {
  buildHttpStatusErrorEvent,
  classifyHttpStatus,
} from "@app/lib/model_constructors/utils/classify_http_status";
import { describe, expect, it } from "vitest";

const metadata: EndpointMetadata = {
  lab: "anthropic",
  host: "anthropic",
  region: "us",
  model: "claude-sonnet-4-6",
};

describe("classifyHttpStatus", () => {
  it.each([
    [400, "invalid_request_error", "dust"],
    [422, "invalid_request_error", "dust"],
    [401, "authentication_error", "dust"],
    [403, "permission_error", "dust"],
    [404, "not_found_error", "dust"],
    [413, "invalid_request_error", "dust"],
    [418, "invalid_request_error", "dust"],
    [429, "rate_limit_error", "dust"],
    [500, "server_error", "provider"],
    [503, "overloaded_error", "provider"],
    [529, "server_error", "provider"],
  ] as const)("maps HTTP %i to %s from %s", (status, type, errorSource) => {
    expect(classifyHttpStatus(status)).toEqual({ type, errorSource });
  });

  it("maps a missing or non-HTTP status to unknown", () => {
    expect(classifyHttpStatus(undefined)).toEqual({
      type: "unknown_error",
      errorSource: "unknown",
    });
    expect(classifyHttpStatus(200)).toEqual({
      type: "unknown_error",
      errorSource: "unknown",
    });
  });
});

describe("buildHttpStatusErrorEvent", () => {
  it("builds the message from type, provider, and status", () => {
    expect(
      buildHttpStatusErrorEvent({
        metadata,
        status: 400,
        provider: "Anthropic",
        detail: "bad payload",
      }).content
    ).toMatchObject({
      type: "invalid_request_error",
      errorSource: "dust",
      message: "Invalid request to Anthropic: bad payload",
    });

    expect(
      buildHttpStatusErrorEvent({
        metadata,
        status: 429,
        provider: "Anthropic",
        detail: "slow down",
      }).content.message
    ).toBe("Rate limit exceeded for Anthropic/claude-sonnet-4-6: slow down");

    expect(
      buildHttpStatusErrorEvent({
        metadata,
        status: 500,
        provider: "Anthropic",
        detail: "kaboom",
      }).content.message
    ).toBe("Server error from Anthropic (500): kaboom");

    expect(
      buildHttpStatusErrorEvent({
        metadata,
        status: 503,
        provider: "Anthropic",
        detail: "busy",
      }).content.message
    ).toBe("Anthropic is overloaded: busy");
  });
});
