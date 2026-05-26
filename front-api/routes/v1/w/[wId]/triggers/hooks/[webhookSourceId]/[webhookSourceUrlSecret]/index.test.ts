import { Authenticator } from "@app/lib/auth";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const launchTriggersWorkflowsMock = vi.hoisted(() =>
  vi.fn(async () => ({
    isErr: () => false,
  }))
);

const uploadWebhookPayloadMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined)
);

// Shallowly mock file content fragment creation to avoid touching storage.
vi.mock("@app/lib/api/assistant/conversation/content_fragment", () => ({
  toFileContentFragment: vi.fn(async () => ({
    isOk: () => true,
    isErr: () => false,
    value: { title: "mock", url: null, fileId: "file_mock" },
  })),
}));

// Avoid UDP socket usage from StatsD in tests
vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({
    increment: vi.fn(),
    distribution: vi.fn(),
  }),
}));

vi.mock("@app/lib/file_storage", () => ({
  getWebhookRequestsBucket: () => ({
    uploadRawContentToBucket: vi.fn().mockResolvedValue(undefined),
    uploadSmallRawContentToBucketAsNewFile: uploadWebhookPayloadMock,
  }),
}));

vi.mock("@app/temporal/triggers/webhook_client", () => ({
  launchTriggersWorkflows: launchTriggersWorkflowsMock,
}));

function postWebhook(
  workspace: { sId: string },
  webhookSourceId: string,
  webhookSourceUrlSecret: string,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/triggers/hooks/${webhookSourceId}/${webhookSourceUrlSecret}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    }
  );
}

async function makeTriggerEditorAuth(workspace: WorkspaceType) {
  const triggerEditor = await UserFactory.basic();
  await MembershipFactory.associate(workspace, triggerEditor, {
    role: "builder",
  });

  return Authenticator.fromUserIdAndWorkspaceId(
    triggerEditor.sId,
    workspace.sId
  );
}

async function createWebhookSourceAndTrigger(
  workspace: WorkspaceType,
  {
    includePayload,
    filter,
  }: {
    includePayload: boolean;
    filter?: string;
  }
) {
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const triggerEditorAuth = await makeTriggerEditorAuth(workspace);
  const { systemSpace } = await SpaceFactory.defaults(adminAuth);

  const webhookSource = await new WebhookSourceFactory(workspace).create({
    name: "Test Webhook Source",
  });
  const webhookSourceView = await new WebhookSourceViewFactory(
    workspace
  ).create(systemSpace, { webhookSourceId: webhookSource.sId });

  await TriggerFactory.webhook(triggerEditorAuth, {
    agentConfigurationId: "agent_test",
    status: "enabled",
    webhookSourceViewId: webhookSourceView.id,
    configuration: {
      includePayload,
      ...(filter ? { filter } : {}),
    },
  });

  return webhookSource;
}

describe("POST /api/v1/w/[wId]/triggers/hooks/[webhookSourceId]/[webhookSourceUrlSecret]", () => {
  beforeEach(() => {
    launchTriggersWorkflowsMock.mockClear();
    uploadWebhookPayloadMock.mockClear();
  });

  it("returns 200 when workspace and webhook source exist", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSource = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    const response = await postWebhook(
      workspace,
      webhookSource.sId,
      webhookSource.urlSecret,
      { any: "payload" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 404 when webhook source does not exist", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const response = await postWebhook(
      workspace,
      "webhook_source/nonexistent",
      "any-secret",
      { any: "payload" }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("webhook_source_not_found");
  });

  it("returns 404 on non-POST methods", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/triggers/hooks/webhook_source/whatever/any-secret`,
      {
        method: "GET",
      }
    );

    // Hono returns 404 when no GET route is registered (vs. 405 in Next).
    expect(response.status).toBe(404);
  });

  it("returns 400 when content-type is not application/json", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/triggers/hooks/webhook_source/whatever/any-secret`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toBe("Content-Type must be application/json.");
  });

  it("returns 401 when webhook URL secret is invalid", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSource = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    const response = await postWebhook(
      workspace,
      webhookSource.sId,
      "invalid-secret",
      { any: "payload" }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.type).toBe("webhook_source_auth_error");
    expect(data.error.message).toBe("Invalid webhook path.");
  });

  it("returns 200 when webhook URL secret is valid", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    const customUrlSecret = "my-custom-url-secret-123";
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSource = await webhookSourceFactory.create({
      name: "Test Webhook Source with URL Secret",
      urlSecret: customUrlSecret,
    });

    const response = await postWebhook(
      workspace,
      webhookSource.sId,
      customUrlSecret,
      { any: "payload" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("stores payload when a matched trigger includes payload", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const webhookSource = await createWebhookSourceAndTrigger(workspace, {
      includePayload: true,
    });

    const response = await postWebhook(
      workspace,
      webhookSource.sId,
      webhookSource.urlSecret,
      { any: "payload" }
    );

    expect(response.status).toBe(200);
    expect(uploadWebhookPayloadMock).toHaveBeenCalledTimes(1);
    expect(launchTriggersWorkflowsMock).toHaveBeenCalledTimes(1);
  });

  it("does not store payload when matched triggers do not include payload", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const webhookSource = await createWebhookSourceAndTrigger(workspace, {
      includePayload: false,
    });

    const response = await postWebhook(
      workspace,
      webhookSource.sId,
      webhookSource.urlSecret,
      { any: "payload" }
    );

    expect(response.status).toBe(200);
    expect(uploadWebhookPayloadMock).not.toHaveBeenCalled();
    expect(launchTriggersWorkflowsMock).toHaveBeenCalledTimes(1);
  });

  it("does not store payload when no triggers match", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const webhookSource = await createWebhookSourceAndTrigger(workspace, {
      includePayload: true,
      filter: '(eq "type" "wanted")',
    });

    const response = await postWebhook(
      workspace,
      webhookSource.sId,
      webhookSource.urlSecret,
      { type: "ignored" }
    );

    expect(response.status).toBe(200);
    expect(uploadWebhookPayloadMock).not.toHaveBeenCalled();
    expect(launchTriggersWorkflowsMock).not.toHaveBeenCalled();
  });

  it("returns 200 when GitHub webhook source does not subscribe to pull_request event", async () => {
    const { workspace } = await createPublicApiMockRequest();

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSource = await webhookSourceFactory.create({
      name: "Test GitHub Webhook Source",
      provider: "github",
      subscribedEvents: ["issues"], // Subscribe to issues but not pull_request
    });

    const response = await postWebhook(
      workspace,
      webhookSource.sId,
      webhookSource.urlSecret,
      {
        action: "opened",
        issue: {
          url: "https://api.github.com/repos/example/repo/issues/1",
          id: 1001,
          number: 1,
        },
        assignee: { login: "octocat" },
        label: { id: 208045946 },
        sender: { login: "octocat" },
      },
      { "x-github-event": "pull_request" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});
