import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import type { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import {
  fetchRecentWebhookRequestTriggersWithPayload,
  processWebhookRequest,
} from "@app/lib/triggers/webhook";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIsApiBlocked, mockCheckWebhookRequestForRateLimit } = vi.hoisted(
  () => ({
    mockIsApiBlocked: vi.fn(),
    mockCheckWebhookRequestForRateLimit: vi.fn(),
  })
);

vi.mock("@app/lib/api/credits/access_control", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@app/lib/api/credits/access_control")
  >()),
  isApiBlocked: mockIsApiBlocked,
}));

vi.mock("@app/lib/triggers/rate_limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/triggers/rate_limits")>()),
  checkWebhookRequestForRateLimit: mockCheckWebhookRequestForRateLimit,
}));

vi.mock("@app/lib/temporal", () => ({
  heartbeat: vi.fn().mockResolvedValue(undefined),
  getTemporalClientForAgentNamespace: vi.fn().mockResolvedValue({
    schedule: {
      getHandle: vi.fn().mockReturnValue({
        update: vi.fn(),
        delete: vi.fn(),
      }),
    },
    workflow: {
      start: vi.fn().mockResolvedValue(undefined),
    },
  }),
  getTemporalClientForFrontNamespace: vi.fn().mockResolvedValue({
    workflow: {
      start: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

describe("processWebhookRequest", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let webhookSource: WebhookSourceResource;
  let trigger: TriggerResource;

  beforeEach(async () => {
    mockIsApiBlocked.mockResolvedValue(false);
    mockCheckWebhookRequestForRateLimit.mockResolvedValue({
      rateLimited: false,
    });

    workspace = await WorkspaceFactory.creditPriced();
    const editorUser = await UserFactory.basic();
    const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
    await MembershipFactory.associate(workspace, editorUser, { role: "admin" });

    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
      globalGroup,
      systemGroup,
    });

    auth = await Authenticator.fromUserIdAndWorkspaceId(
      editorUser.sId,
      workspace.sId
    );

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Webhook Agent",
    });
    const globalSpace =
      await SpaceResource.fetchWorkspaceGlobalSpace(internalAdminAuth);
    const webhookSourceView = await new WebhookSourceViewFactory(
      workspace
    ).create(globalSpace);
    webhookSource = webhookSourceView.webhookSource;

    trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
      name: "Webhook Trigger",
      status: "enabled",
      webhookSourceViewId: webhookSourceView.id,
      configuration: { includePayload: false },
    });
  });

  async function postWebhookRequest() {
    const webhookRequest = await WebhookRequestResource.makeNew({
      workspaceId: workspace.id,
      webhookSourceId: webhookSource.id,
      status: "received",
    });

    const body = { event: "something.happened" };

    return processWebhookRequest(auth, {
      webhookSource,
      webhookRequest,
      headers: {},
      body,
      rawBody: JSON.stringify(body),
    });
  }

  async function fetchTriggerRequests() {
    return fetchRecentWebhookRequestTriggersWithPayload(auth, {
      trigger: trigger.toJSON(),
    });
  }

  it("marks the request as credits_exhausted when the credit pool is depleted", async () => {
    mockIsApiBlocked.mockResolvedValue(true);

    const result = await postWebhookRequest();
    expect(result.isOk()).toBe(true);

    const requests = await fetchTriggerRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("credits_exhausted");
    expect(requests[0].errorMessage).toContain("run out of credits");
  });

  it("marks the request as rate_limited when the workspace fair-use limit is reached", async () => {
    mockCheckWebhookRequestForRateLimit.mockResolvedValue({
      rateLimited: true,
      message: "Webhook triggers rate limit exceeded.",
    });

    const result = await postWebhookRequest();
    expect(result.isOk()).toBe(true);

    const requests = await fetchTriggerRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("rate_limited");
    expect(requests[0].errorMessage).toContain("rate limit exceeded");
  });

  it("starts the trigger workflow when nothing blocks the request", async () => {
    const result = await postWebhookRequest();
    expect(result.isOk()).toBe(true);

    const requests = await fetchTriggerRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("workflow_start_succeeded");
    expect(requests[0].errorMessage).toBeNull();
  });
});
