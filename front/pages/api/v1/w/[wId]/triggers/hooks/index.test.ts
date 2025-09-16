import type { RequestMethod } from "node-mocks-http";
import { createMocks } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

// Shallowly mock file content fragment creation to avoid touching storage.
vi.mock("@app/lib/api/assistant/conversation/content_fragment", () => ({
  toFileContentFragment: vi.fn(async () => ({
    isOk: () => true,
    isErr: () => false,
    value: { title: "mock", url: null, fileId: "file_mock" },
  })),
}));

// Avoid UDP socket usage from StatsD in tests
vi.mock("@app/logger/statsDClient", () => ({
  statsDClient: {
    increment: vi.fn(),
    distribution: vi.fn(),
  },
}));

// Minimal mocks for resources used by the handler to keep the test shallow
vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    internalBuilderForWorkspace: vi.fn(async () => ({
      getNonNullableWorkspace: () => ({ id: 1, sId: "w_1" }),
      user: () => null,
      isAdmin: () => true,
    })),
    fromUserIdAndWorkspaceId: vi.fn(async () => ({
      getNonNullableWorkspace: () => ({ id: 1, sId: "w_1" }),
      getNonNullableUser: () => ({ sId: "user_1" }),
    })),
  },
  getSession: vi.fn(async () => null),
}));

vi.mock("@app/lib/resources/workspace_resource", () => ({
  WorkspaceResource: {
    fetchById: vi.fn(async (wId: string) =>
      wId === "w_1" ? { id: 1, sId: "w_1", name: "Test" } : null
    ),
  },
}));

vi.mock("@app/lib/resources/group_resource", () => ({
  GroupResource: {
    internalFetchWorkspaceGlobalGroup: vi.fn(async () => null),
    internalFetchAllWorkspaceGroups: vi.fn(async () => []),
    listGroupsWithSystemKey: vi.fn(async () => []),
  },
}));

vi.mock("@app/lib/resources/subscription_resource", () => ({
  SubscriptionResource: {
    fetchActiveByWorkspace: vi.fn(async () => null),
  },
}));

vi.mock("@app/lib/resources/webhook_source_resource", () => ({
  WebhookSourceResource: {
    fetchById: vi.fn(async (_auth: unknown, sId: string) =>
      sId === "webhook_source/1"
        ? { id: 99, sId: () => "webhook_source/1", updatedAt: new Date() }
        : null
    ),
    modelIdToSId: ({ id }: { id: number }) => `webhook_source/${id}`,
  },
}));

vi.mock("@app/lib/resources/webhook_sources_view_resource", () => ({
  WebhookSourcesViewResource: {
    listByWebhookSource: vi.fn(async () => [{ id: 111 }]),
  },
}));

vi.mock("@app/lib/resources/trigger_resource", () => ({
  TriggerResource: {
    listByWebhookSourceViewId: vi.fn(async () => []),
  },
}));

vi.mock("@app/lib/resources/user_resource", () => ({
  UserResource: {
    fetchByModelId: vi.fn(async () => ({ sId: "user_1" })),
    fetchById: vi.fn(async () => ({ id: 101, sId: "user_1" })),
  },
}));

vi.mock("@app/temporal/agent_schedule/client", () => ({
  launchAgentTriggerWorkflow: vi.fn(async () => ({
    isOk: () => true,
    isErr: () => false,
    value: undefined,
  })),
}));

import handler from "./[webhookSourceId]";

async function setupTest(method: RequestMethod = "POST") {
  const { req, res, workspace } = await createPrivateApiMockRequest({
    method,
  });
  return { req, res, workspace };
}

describe("POST /api/v1/w/[wId]/triggers/hooks/[webhookSourceId]", () => {
  it("returns 200 when workspace and webhook source exist", async () => {
    const { req, res, workspace } = await setupTest("POST");

    await SpaceFactory.system(workspace);
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const created = await webhookSourceFactory.create();
    if (created.isErr()) {
      throw created.error;
    }
    const webhookSourceId = created.value.sId();

    req.query.wId = workspace.sId;
    req.query.webhookSourceId = webhookSourceId;

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it("returns 404 when webhook source does not exist", async () => {
    const { req, res, workspace } = await setupTest("POST");

    req.query.wId = workspace.sId;
    req.query.webhookSourceId = WebhookSourceResource.modelIdToSId({
      id: 999999999,
      workspaceId: workspace.id,
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(404);
    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error.type).toBe("webhook_source_not_found");
  });

  it("returns 405 on non-POST methods", async () => {
    const { req, res, workspace } = await setupTest("GET");
    req.query.wId = workspace.sId;
    req.query.webhookSourceId = "webhook_source/whatever";

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(405);
  });
});
