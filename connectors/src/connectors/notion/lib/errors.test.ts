import {
  APIErrorCode,
  APIResponseError,
  RequestTimeoutError,
  UnknownHTTPResponseError,
} from "@notionhq/client";
import { describe, expect, it } from "vitest";

import { isUnhealthyNotionError } from "./errors";

describe("isUnhealthyNotionError", () => {
  it.each([
    new RequestTimeoutError(),
    new APIResponseError({
      code: APIErrorCode.InternalServerError,
      status: 500,
      message: "Internal server error",
      headers: new Headers(),
      rawBodyText: "",
    }),
    new UnknownHTTPResponseError({
      status: 502,
      message: "Bad gateway",
      headers: new Headers(),
      rawBodyText: "",
    }),
    { code: "internal_server_error" },
    { code: "notionhq_client_request_timeout" },
    { code: "service_unavailable" },
    { code: "notionhq_client_response_error" },
    { status: 500 },
    { status: 599 },
    { code: null, status: 503 },
  ])("recognizes unhealthy SDK errors and provider payloads: %j", (error) => {
    expect(isUnhealthyNotionError(error)).toBe(true);
  });

  it.each([
    null,
    undefined,
    "service_unavailable",
    503,
    new Error("Unexpected failure"),
    {},
    { code: "rate_limited", status: 429 },
    { code: "unauthorized", status: 401 },
    { code: "object_not_found", status: 404 },
    { code: {}, status: "503" },
    { status: 499 },
    { status: 600 },
  ])("rejects malformed values and other failures: %j", (error) => {
    expect(isUnhealthyNotionError(error)).toBe(false);
  });
});
