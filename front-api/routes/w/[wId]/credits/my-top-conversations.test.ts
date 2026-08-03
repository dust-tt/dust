import * as creditUsage from "@app/lib/api/assistant/observability/credit_usage";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/observability/credit_usage", async () => {
  const actual = await vi.importActual<typeof creditUsage>(
    "@app/lib/api/assistant/observability/credit_usage"
  );
  return { ...actual, fetchTopConversationsByCredits: vi.fn() };
});

function myTopConversationsUrl(wId: string) {
  return `/api/w/${wId}/credits/my-top-conversations`;
}

const TOP_CONVERSATIONS = [
  { conversationId: "conv1", title: "Quarterly report", totalCredits: 420 },
  { conversationId: "conv2", title: null, totalCredits: 120 },
];

beforeEach(() => {
  vi.mocked(creditUsage.fetchTopConversationsByCredits).mockResolvedValue(
    new Ok(TOP_CONVERSATIONS)
  );
});

describe("GET /api/w/[wId]/credits/my-top-conversations", () => {
  it("returns the caller's most expensive conversations", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(
      myTopConversationsUrl(workspace.sId)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversations: TOP_CONVERSATIONS,
    });
    expect(creditUsage.fetchTopConversationsByCredits).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 10,
        userIds: [user.sId],
      })
    );
  });

  it("returns 500 when the analytics query fails", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    vi.mocked(creditUsage.fetchTopConversationsByCredits).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );

    const response = await honoApp.request(
      myTopConversationsUrl(workspace.sId)
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error.type).toBe("internal_server_error");
  });
});
