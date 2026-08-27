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
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";

const CONNECTOR_ID = "1234";
const BOT_NAME = "Weekly report";
const CREATED_AT = 1756166400000;

function mockSlackBotDataSource({ connected }: { connected: boolean }) {
  vi.spyOn(DataSourceResource, "listByConnectorProvider").mockImplementation(((
    _auth: unknown,
    provider: string
  ) =>
    Promise.resolve(
      provider === "slack_bot" && connected
        ? [{ connectorId: CONNECTOR_ID }]
        : []
    )) as unknown as typeof DataSourceResource.listByConnectorProvider);
}

function mockWhitelist(bots: { botName: string; groupIds: string[] }[]) {
  return vi
    .spyOn(ConnectorsAPI.prototype, "getSlackBotSummoningWhitelist")
    .mockResolvedValue(
      new Ok({
        bots: bots.map((bot) => ({ ...bot, createdAt: CREATED_AT })),
      })
    );
}

async function setupTest({
  role = "admin",
  workspace,
}: {
  role?: MembershipRoleType;
  workspace?: WorkspaceType;
} = {}) {
  const setup = await createPrivateApiMockRequest({
    role,
    workspace: workspace ?? (await WorkspaceFactory.creditPriced()),
  });
  mockSlackBotDataSource({ connected: true });

  return setup;
}

async function createSpace(workspace: WorkspaceType) {
  const space = await SpaceFactory.regular(workspace);
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const [enriched] = await SpaceResource.batchToJSONEnriched(auth, [space]);

  return enriched;
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

describe("GET /api/w/:wId/slack-workflows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 403 for managers", async () => {
    const { workspace } = await setupTest({ role: "manager" });
    const whitelist = mockWhitelist([]);

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
    const whitelist = mockWhitelist([]);

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
    const { workspace, globalGroup } = await setupTest();
    const space = await createSpace(workspace);
    mockWhitelist([
      { botName: BOT_NAME, groupIds: [...space.groupIds, globalGroup.sId] },
    ]);

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      isSlackBotConnected: true,
      workflows: [
        {
          botName: BOT_NAME,
          spaces: [{ sId: space.sId, name: space.name }],
          createdAt: CREATED_AT,
        },
      ],
    });
  });

  it("reports the Slack bot as disconnected instead of failing", async () => {
    const { workspace } = await setupTest();
    mockSlackBotDataSource({ connected: false });

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
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("always allows the workflow on the workspace group", async () => {
    const { workspace, globalGroup } = await setupTest();
    const whitelist = vi
      .spyOn(ConnectorsAPI.prototype, "whitelistSlackBotToSummon")
      .mockResolvedValue(new Ok({ success: true }));

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "POST",
      body: { botName: `  ${BOT_NAME}  `, spaceIds: [] },
    });

    expect(response.status).toBe(200);
    expect(whitelist).toHaveBeenCalledWith({
      connectorId: CONNECTOR_ID,
      botName: BOT_NAME,
      groupIds: [globalGroup.sId],
    });
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "slack_workflow.allowed",
        metadata: { bot_name: BOT_NAME, group_names: globalGroup.name },
      })
    );
  });

  it("returns 400 on an empty workflow name", async () => {
    const { workspace } = await setupTest();
    const whitelist = vi.spyOn(
      ConnectorsAPI.prototype,
      "whitelistSlackBotToSummon"
    );

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "POST",
      body: { botName: "   ", spaceIds: [] },
    });

    expect(response.status).toBe(400);
    expect(whitelist).not.toHaveBeenCalled();
  });

  it("allows the workflow on the groups of the selected spaces", async () => {
    const { workspace, globalGroup } = await setupTest();
    const space = await createSpace(workspace);
    const whitelist = vi
      .spyOn(ConnectorsAPI.prototype, "whitelistSlackBotToSummon")
      .mockResolvedValue(new Ok({ success: true }));

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "POST",
      body: { botName: BOT_NAME, spaceIds: [space.sId] },
    });

    expect(response.status).toBe(200);
    expect(whitelist).toHaveBeenCalledWith({
      connectorId: CONNECTOR_ID,
      botName: BOT_NAME,
      groupIds: [...space.groupIds, globalGroup.sId],
    });
  });

  it("returns 400 on spaces outside of the workspace", async () => {
    const { workspace } = await setupTest();
    const whitelist = vi.spyOn(
      ConnectorsAPI.prototype,
      "whitelistSlackBotToSummon"
    );

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "POST",
      body: { botName: BOT_NAME, spaceIds: ["spc_unknown"] },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
    expect(whitelist).not.toHaveBeenCalled();
    expect(vi.mocked(emitAuditLogEvent)).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/w/:wId/slack-workflows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("revokes a workflow", async () => {
    const { workspace } = await setupTest();
    const revoke = vi
      .spyOn(ConnectorsAPI.prototype, "unwhitelistSlackBotToSummon")
      .mockResolvedValue(new Ok({ success: true }));

    const response = await slackWorkflowsRequest(workspace.sId, {
      method: "DELETE",
      body: { botName: BOT_NAME },
    });

    expect(response.status).toBe(200);
    expect(revoke).toHaveBeenCalledWith({
      connectorId: CONNECTOR_ID,
      botName: BOT_NAME,
    });
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "slack_workflow.revoked",
        metadata: { bot_name: BOT_NAME },
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
      body: { botName: BOT_NAME },
    });

    expect(response.status).toBe(404);
    expect(vi.mocked(emitAuditLogEvent)).not.toHaveBeenCalled();
  });
});
