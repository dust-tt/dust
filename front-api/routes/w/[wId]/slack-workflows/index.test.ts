import type * as workosAudit from "@app/lib/api/audit/workos_audit";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return {
    ...actual,
    emitAuditLogEvent: vi.fn(),
  };
});

import { emitAuditLogEvent } from "@app/lib/api/audit/workos_audit";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  connectSlackBot,
  mockAllowSlackWorkflow,
  mockRevokeSlackWorkflow,
  mockSummoningWhitelist,
  SLACK_BOT_CONNECTOR_ID,
  SLACK_WORKFLOW_BOT_NAME,
  SLACK_WORKFLOW_CREATED_AT_MS,
} from "@app/tests/utils/slack_workflows";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";

async function setupTest({
  role = "admin",
  workspace,
  withSlackBot = true,
}: {
  role?: MembershipRoleType;
  workspace?: WorkspaceType;
  withSlackBot?: boolean;
} = {}) {
  const setup = await createPrivateApiMockRequest({
    role,
    workspace: workspace ?? (await WorkspaceFactory.creditPriced()),
  });
  if (withSlackBot) {
    await connectSlackBot(setup.workspace, setup.systemSpace);
  }

  return setup;
}

function slackWorkflowsRequest(
  wId: string,
  { method, body }: { method: string; body?: Record<string, unknown> }
) {
  return honoApp.request(`/api/w/${wId}/slack-workflows`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/w/:wId/slack-workflows", () => {
  it("returns 403 for managers", async () => {
    const { workspace } = await setupTest({ role: "manager" });
    const whitelist = mockSummoningWhitelist([]);

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "GET",
    });

    expect(response.status).toBe(403);
    expect(whitelist).not.toHaveBeenCalled();
  });

  it("returns 403 on a plan that is not credit-priced", async () => {
    const { workspace } = await setupTest({
      workspace: await WorkspaceFactory.basic(),
    });
    const whitelist = mockSummoningWhitelist([]);

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "GET",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "plan_limit_error" },
    });
    expect(whitelist).not.toHaveBeenCalled();
  });

  it("resolves the spaces of the allowed workflows", async () => {
    const { workspace, globalSpace } = await setupTest();
    const space = await SpaceFactory.regular(workspace);
    mockSummoningWhitelist([
      {
        botName: SLACK_WORKFLOW_BOT_NAME,
        spaceIds: [globalSpace.sId, space.sId],
      },
    ]);

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      isSlackBotConnected: true,
      workflows: [
        {
          botName: SLACK_WORKFLOW_BOT_NAME,
          spaces: [{ sId: space.sId, name: space.name }],
          createdAt: SLACK_WORKFLOW_CREATED_AT_MS,
        },
      ],
    });
  });

  it("reports the Slack bot as disconnected instead of failing", async () => {
    const { workspace } = await setupTest({ withSlackBot: false });

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      isSlackBotConnected: false,
      workflows: [],
    });
  });
});

describe("POST /api/w/:wId/slack-workflows", () => {
  it("always allows the workflow on the Company Space", async () => {
    const { workspace, globalSpace } = await setupTest();
    const allow = mockAllowSlackWorkflow();

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "POST",
      body: { botName: `  ${SLACK_WORKFLOW_BOT_NAME}  `, spaceIds: [] },
    });

    expect(response.status).toBe(200);
    expect(allow).toHaveBeenCalledWith({
      connectorId: SLACK_BOT_CONNECTOR_ID,
      botName: SLACK_WORKFLOW_BOT_NAME,
      spaceIds: [globalSpace.sId],
    });
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "slack_workflow.allowed",
        metadata: {
          bot_name: SLACK_WORKFLOW_BOT_NAME,
          space_names: "",
        },
      })
    );
  });

  it("allows the workflow on the selected spaces", async () => {
    const { workspace, globalSpace } = await setupTest();
    const space = await SpaceFactory.regular(workspace);
    const allow = mockAllowSlackWorkflow();

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "POST",
      body: { botName: SLACK_WORKFLOW_BOT_NAME, spaceIds: [space.sId] },
    });

    expect(response.status).toBe(200);
    expect(allow).toHaveBeenCalledWith({
      connectorId: SLACK_BOT_CONNECTOR_ID,
      botName: SLACK_WORKFLOW_BOT_NAME,
      spaceIds: [globalSpace.sId, space.sId],
    });
  });

  it("returns 400 on an empty workflow name", async () => {
    const { workspace } = await setupTest();
    const allow = mockAllowSlackWorkflow();

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "POST",
      body: { botName: "   ", spaceIds: [] },
    });

    expect(response.status).toBe(400);
    expect(allow).not.toHaveBeenCalled();
  });

  it("returns 400 on spaces outside of the workspace", async () => {
    const { workspace } = await setupTest();
    const allow = mockAllowSlackWorkflow();

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "POST",
      body: { botName: SLACK_WORKFLOW_BOT_NAME, spaceIds: ["spc_unknown"] },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
    expect(allow).not.toHaveBeenCalled();
    expect(vi.mocked(emitAuditLogEvent)).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/w/:wId/slack-workflows", () => {
  it("revokes a workflow", async () => {
    const { workspace } = await setupTest();
    const revoke = mockRevokeSlackWorkflow();

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "DELETE",
      body: { botName: SLACK_WORKFLOW_BOT_NAME },
    });

    expect(response.status).toBe(200);
    expect(revoke).toHaveBeenCalledWith({
      connectorId: SLACK_BOT_CONNECTOR_ID,
      botName: SLACK_WORKFLOW_BOT_NAME,
    });
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "slack_workflow.revoked",
        metadata: { bot_name: SLACK_WORKFLOW_BOT_NAME },
      })
    );
  });

  it("returns 404 when the workflow is not allowed", async () => {
    const { workspace } = await setupTest();
    vi.spyOn(
      ConnectorsAPI.prototype,
      "unwhitelistSlackBotToSummon"
    ).mockResolvedValue(
      new Err({ type: "not_found", message: "No whitelisted bot" })
    );

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "DELETE",
      body: { botName: SLACK_WORKFLOW_BOT_NAME },
    });

    expect(response.status).toBe(404);
    expect(vi.mocked(emitAuditLogEvent)).not.toHaveBeenCalled();
  });
});
