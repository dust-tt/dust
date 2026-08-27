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
import {
  connectSlackBot,
  createSpaceWithMemberGroup,
  mockRevokeSlackWorkflow,
  mockSummoningWhitelist,
  SLACK_BOT_CONNECTOR_ID,
  SLACK_WORKFLOW_BOT_NAME,
  SLACK_WORKFLOW_CREATED_AT_MS,
} from "@app/tests/utils/slack_workflows";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";

async function setupTest({
  isSuperUser = true,
  withSlackBot = true,
}: {
  isSuperUser?: boolean;
  withSlackBot?: boolean;
} = {}) {
  const setup = await createPrivateApiMockRequest({
    isSuperUser,
    role: "admin",
  });
  if (withSlackBot) {
    await connectSlackBot(setup.workspace, setup.systemSpace);
  }

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
    const whitelist = mockSummoningWhitelist([]);

    const response = await pokeSlackWorkflowsRequest(workspace.sId, {
      method: "GET",
    });

    expect(response.status).toBe(401);
    expect(whitelist).not.toHaveBeenCalled();
  });

  it("lists the allowed workflows with their spaces", async () => {
    const { workspace, globalGroup } = await setupTest();
    const { space, memberGroupId } =
      await createSpaceWithMemberGroup(workspace);
    mockSummoningWhitelist([
      {
        botName: SLACK_WORKFLOW_BOT_NAME,
        groupIds: [memberGroupId, globalGroup.sId],
      },
    ]);

    const response = await pokeSlackWorkflowsRequest(workspace.sId, {
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
    const revoke = mockRevokeSlackWorkflow();

    const response = await pokeSlackWorkflowsRequest(workspace.sId, {
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

    const response = await pokeSlackWorkflowsRequest(workspace.sId, {
      method: "DELETE",
      body: { botName: SLACK_WORKFLOW_BOT_NAME },
    });

    expect(response.status).toBe(404);
    expect(vi.mocked(emitAuditLogEvent)).not.toHaveBeenCalled();
  });
});
