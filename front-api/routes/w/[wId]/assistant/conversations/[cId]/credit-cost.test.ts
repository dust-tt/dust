import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { afterEach, describe, expect, it, vi } from "vitest";

function makeConversationResource(totalCostCredits: number | null) {
  return {
    getStoredCreditCost: vi.fn().mockResolvedValue(totalCostCredits),
  } satisfies Pick<ConversationResource, "getStoredCreditCost">;
}

function get(workspace: { sId: string }) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/conversation_sid/credit-cost`
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/w/:wId/assistant/conversations/:cId/credit-cost", () => {
  it("returns the aggregated credit cost of the conversation", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
      method: "GET",
    });

    const conversation = makeConversationResource(42);
    vi.spyOn(ConversationResource, "fetchById").mockResolvedValue(
      conversation as unknown as ConversationResource
    );

    const response = await get(workspace);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ totalCostCredits: 42 });
    expect(conversation.getStoredCreditCost).toHaveBeenCalledOnce();
  });

  it("returns null when the conversation has no billable usage", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
      method: "GET",
    });

    vi.spyOn(ConversationResource, "fetchById").mockResolvedValue(
      makeConversationResource(null) as unknown as ConversationResource
    );

    const response = await get(workspace);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ totalCostCredits: null });
  });

  it("returns 404 when the conversation does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
      method: "GET",
    });

    vi.spyOn(ConversationResource, "fetchById").mockResolvedValue(null);

    const response = await get(workspace);

    expect(response.status).toBe(404);
  });
});
