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
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";
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

async function setupTest({
  isSuperUser = true,
}: {
  isSuperUser?: boolean;
} = {}) {
  const setup = await createPrivateApiMockRequest({
    isSuperUser,
    role: "admin",
  });
  mockSlackBotDataSource({ connected: true });

  return setup;
}

function pokeSlackWorkflowsRequest(
  wId: string,
  { method, body }: { method: string; body?: Record<string, unknown> }
) {
  return honoApp.request(`/api/poke/workspaces/${wId}/slack-workflows`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/poke/workspaces/[wId]/slack-workflows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 for non super users", async () => {
    const { workspace } = await setupTest({ isSuperUser: false });
    const whitelist = vi.spyOn(
      ConnectorsAPI.prototype,
      "getSlackBotSummoningWhitelist"
    );

    const response = await pokeSlackWorkflowsRequest(workspace.sId, {
      method: "GET",
    });

    expect(response.status).toBe(401);
    expect(whitelist).not.toHaveBeenCalled();
  });

  it("lists the allowed workflows with their spaces", async () => {
    const { workspace, globalSpace } = await setupTest();
    const space = await SpaceFactory.regular(workspace);
    vi.spyOn(
      ConnectorsAPI.prototype,
      "getSlackBotSummoningWhitelist"
    ).mockResolvedValue(
      new Ok({
        bots: [
          {
            botName: BOT_NAME,
            spaceIds: [globalSpace.sId, space.sId],
            createdAt: CREATED_AT,
          },
        ],
      })
    );

    const response = await pokeSlackWorkflowsRequest(workspace.sId, {
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

    const response = await pokeSlackWorkflowsRequest(workspace.sId, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      isSlackBotConnected: false,
      workflows: [],
    });
  });
});

describe("DELETE /api/poke/workspaces/[wId]/slack-workflows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("revokes a workflow and audits the support actor", async () => {
    const { workspace } = await setupTest();
    const revoke = vi
      .spyOn(ConnectorsAPI.prototype, "unwhitelistSlackBotToSummon")
      .mockResolvedValue(new Ok({ success: true }));

    const response = await pokeSlackWorkflowsRequest(workspace.sId, {
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

    const response = await pokeSlackWorkflowsRequest(workspace.sId, {
      method: "DELETE",
      body: { botName: BOT_NAME },
    });

    expect(response.status).toBe(404);
    expect(vi.mocked(emitAuditLogEvent)).not.toHaveBeenCalled();
  });
});
