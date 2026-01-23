import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";

import { handleError } from "@app/lib/api/llm/clients/google/utils/errors";
import type { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { GEMINI_2_5_PRO_MODEL_ID } from "@app/types";

const metadata: LLMClientMetadata = {
  clientId: "google_ai_studio" as const,
  modelId: GEMINI_2_5_PRO_MODEL_ID,
};

describe("handleError (Google)", () => {
  it("maps ApiError 429 (rate limit)", () => {
    const err = new ApiError({ message: "Too Many Requests", status: 429 });
    const event = handleError(err, metadata) as EventError;
    expect(event.type).toBe("error");
    expect(event.metadata).toEqual(metadata);
    expect(event.content.message.toLowerCase()).toContain("rate limit");
    expect(event.content.message).toContain("google_ai_studio");
  });

  it("maps ApiError 400 (bad request)", () => {
    const err = new ApiError({ message: "Bad Request", status: 400 });
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("invalid request");
  });

  it("maps ApiError 401 (authentication)", () => {
    const err = new ApiError({ message: "Unauthorized", status: 401 });
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("authentication");
  });

  it("maps ApiError 403 (permission)", () => {
    const err = new ApiError({ message: "Forbidden", status: 403 });
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("permission");
  });

  it("maps ApiError 404 (not found)", () => {
    const err = new ApiError({ message: "Not Found", status: 404 });
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("not found");
  });

  it("maps ApiError 500 (server)", () => {
    const err = new ApiError({ message: "Internal Server Error", status: 500 });
    const event = handleError(err, metadata) as EventError;
    expect(event.content.message.toLowerCase()).toContain("server error");
  });
});
