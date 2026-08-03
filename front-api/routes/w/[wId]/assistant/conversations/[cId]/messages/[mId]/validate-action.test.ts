import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { Err } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { validateActionMock } = vi.hoisted(() => ({
  validateActionMock: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/conversation/validate_actions", () => ({
  validateAction: validateActionMock,
}));

const ERROR_MESSAGE =
  "This generation cannot resume because its pending actions belong to different steps. " +
  "Cancel it and retry.";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(ConversationResource, "fetchById").mockResolvedValue(
    {} as ConversationResource
  );
  validateActionMock.mockResolvedValue(
    new Err(new DustError("invalid_request_error", ERROR_MESSAGE))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST validate-action", () => {
  it("returns the multi-step error from the private endpoint", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations/conversation/messages/message/validate-action`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId: "action",
          approved: "approved",
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: ERROR_MESSAGE,
      },
    });
  });

  it("returns the multi-step error from the public endpoint", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/assistant/conversations/conversation/messages/message/validate-action`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${key.secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          actionId: "action",
          approved: "approved",
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: ERROR_MESSAGE,
      },
    });
  });
});
