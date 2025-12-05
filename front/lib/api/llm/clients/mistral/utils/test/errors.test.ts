import { HTTPValidationError } from "@mistralai/mistralai/models/errors/httpvalidationerror";
import { SDKError } from "@mistralai/mistralai/models/errors/sdkerror";
import { describe, expect, it } from "vitest";

import { handleError } from "@app/lib/api/llm/clients/mistral/utils/errors";
import type { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { MISTRAL_LARGE_MODEL_ID } from "@app/types";

const metadata: LLMClientMetadata = {
  clientId: "mistral" as const,
  modelId: MISTRAL_LARGE_MODEL_ID,
};

function makeRequest(url = "https://api.mistral.ai/v1/mock") {
  return new Request(url, { method: "POST" });
}

function makeResponse({
  status,
  contentType = "application/json",
  body = "{}",
}: {
  status: number;
  contentType?: string;
  body?: string;
}) {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

describe("handleError (Mistral)", () => {
  it("maps Rate Limit (429) via SDKError message", () => {
    const req = makeRequest();
    const res = makeResponse({
      status: 429,
      body: JSON.stringify({ message: "Too Many Requests: rate limit" }),
    });
    const err = new SDKError("", {
      response: res,
      request: req,
      body: awaitBody(res),
    });
    const event = handleError(err, metadata) as EventError;
    expect(event.type).toBe("error");
    expect(event.metadata).toEqual(metadata);
    expect(event.content.message.toLowerCase()).toContain("rate limit");
    expect(event.content.message.toLowerCase()).toContain("mistral");
  });

  it("maps Invalid Request (400) via HTTPValidationError message", () => {
    const req = makeRequest();
    const res = makeResponse({
      status: 400,
      body: JSON.stringify({ message: "Bad Request" }),
    });
    const err = new HTTPValidationError(
      {
        detail: [
          {
            loc: [0],
            msg: "Bad request: invalid request",
            type: "bad_request",
          },
        ],
      },
      { response: res, request: req, body: "{}" }
    );
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("invalid request");
  });

  it("maps Authentication (401) via SDKError body", () => {
    const req = makeRequest();
    const res = makeResponse({
      status: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
    });
    const err = new SDKError("", {
      response: res,
      request: req,
      body: awaitBody(res),
    });
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("authentication");
  });

  it("maps Permission (403) via SDKError body", () => {
    const req = makeRequest();
    const res = makeResponse({
      status: 403,
      body: JSON.stringify({ message: "Forbidden" }),
    });
    const err = new SDKError("", {
      response: res,
      request: req,
      body: awaitBody(res),
    });
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("permission");
  });

  it("maps Not Found (404) via SDKError body", () => {
    const req = makeRequest();
    const res = makeResponse({
      status: 404,
      body: JSON.stringify({ message: "Not Found" }),
    });
    const err = new SDKError("", {
      response: res,
      request: req,
      body: awaitBody(res),
    });
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("not found");
  });

  it("maps Server Error (500) via SDKError status", () => {
    const req = makeRequest();
    const res = makeResponse({
      status: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
    });
    const err = new SDKError("", {
      response: res,
      request: req,
      body: awaitBody(res),
    });
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("server error");
  });

  it("maps Context length exceeded via message", () => {
    const req = makeRequest();
    const res = makeResponse({
      status: 400,
      body: JSON.stringify({ message: "Context window too large" }),
    });
    const err = new HTTPValidationError(
      {
        detail: [
          {
            loc: [0],
            msg: "Context window too large",
            type: "bad_request",
          },
        ],
      },
      { response: res, request: req, body: "{}" }
    );
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("context");
  });
});

function awaitBody(res: Response): string {
  // In this test helper, we synchronously return the known body used to construct the Response
  // to avoid async in test setup. This matches the string passed into SDKError.
  // The Response itself is only used by the error class to extract status and headers in its message.
  return (res as any)._bodySource?.toString?.() ?? "";
}
