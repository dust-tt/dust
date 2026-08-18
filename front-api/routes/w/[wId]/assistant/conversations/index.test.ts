import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishAgentMessagesEvents: vi.fn(),
  publishConversationEvent: vi.fn(),
  publishMessageEventsOnMessagePostOrEdit: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/conversation/content_fragment", () => ({
  getContentFragmentBlob: vi.fn(),
}));

import { getContentFragmentBlob } from "@app/lib/api/assistant/conversation/content_fragment";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";

describe("POST /api/w/:wId/assistant/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a conversation with content fragments when private conversation URLs are enabled", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
      privateConversationUrlsByDefault: true,
    });
    expect(updateResult.isOk()).toBe(true);

    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      {
        name: "Route Test Agent",
        description: "Route behavior test agent",
      }
    );

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      auth.user() ?? null
    );

    vi.mocked(getContentFragmentBlob).mockImplementation(async (_auth, cf) => {
      if (!("nodeId" in cf)) {
        throw new Error("Expected a content-node fragment");
      }

      return new Ok({
        contentType: "text/plain",
        fileId: null,
        nodeId: cf.nodeId,
        nodeDataSourceViewId: dataSourceView.id,
        nodeType: "document",
        sourceUrl: null,
        textBytes: null,
        title: cf.title,
      });
    });

    const body = {
      title: "Conversation created from route",
      visibility: "unlisted",
      spaceId: null,
      contentFragments: [
        {
          title: "Workspace context",
          nodeId: "node-1",
          nodeDataSourceViewId: dataSourceView.sId,
          context: { profilePictureUrl: null },
        },
      ],
      message: {
        content: "Hello from the route",
        mentions: [{ configurationId: agentConfiguration.sId }],
        context: {
          timezone: "Europe/Paris",
          profilePictureUrl: null,
        },
      },
    };

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.contentFragments).toHaveLength(1);
    expect(responseData.contentFragments[0]).toMatchObject({
      type: "content_fragment",
      title: "Workspace context",
    });
    expect(responseData.message).toMatchObject({
      type: "user_message",
      content: "Hello from the route",
      mentions: [{ configurationId: agentConfiguration.sId }],
    });

    const flattenedContent = responseData.conversation.content.flat();
    const contentFragmentIndex = flattenedContent.findIndex(
      (item: { type: string }) => item.type === "content_fragment"
    );
    const userMessageIndex = flattenedContent.findIndex(
      (item: { sId?: string; type: string }) =>
        item.type === "user_message" && item.sId === responseData.message.sId
    );

    expect(contentFragmentIndex).toBeGreaterThanOrEqual(0);
    expect(userMessageIndex).toBeGreaterThan(contentFragmentIndex);
    expect(
      flattenedContent.some(
        (item: { type: string }) => item.type === "agent_message"
      )
    ).toBe(true);
  });

  it("requires the database filesystem flag for a standalone conversation", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: null,
          visibility: "unlisted",
          spaceId: null,
          message: null,
          contentFragments: [],
          metadata: { useDatabaseFileSystem: true },
        }),
      }
    );

    expect(response.status).toBe(403);
  });

  it("creates an opted-in standalone conversation when the flag is enabled", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "dust_filesystem");

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Database filesystem",
          visibility: "unlisted",
          spaceId: null,
          message: null,
          contentFragments: [],
          metadata: { useDatabaseFileSystem: true },
        }),
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversation.metadata).toMatchObject({
      useDatabaseFileSystem: true,
    });
  });

  it("does not let a Pod conversation select its filesystem", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "dust_filesystem");

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: null,
          visibility: "unlisted",
          spaceId: "vlt_testPod",
          message: null,
          contentFragments: [],
          metadata: { useDatabaseFileSystem: true },
        }),
      }
    );

    expect(response.status).toBe(400);
  });
});
