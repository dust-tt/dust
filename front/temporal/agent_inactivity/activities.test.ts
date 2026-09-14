import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { ONE_DAY_MS } from "@app/lib/api/assistant/inactivity/policy";
import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import {
  archiveWorkspaceInactiveAgentsActivity,
  getWorkspacesWithInactiveAgentArchivalActivity,
} from "@app/temporal/agent_inactivity/activities";
import * as scheduleClient from "@app/temporal/triggers/schedule_client";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const THRESHOLD_DAYS = 30;

/** Old enough to sit well before any cutoff a 30-day threshold can produce. */
const LONG_AGO = new Date(Date.now() - 90 * ONE_DAY_MS);

/** Archiving disables triggers and cancels wake-ups, both of which reach Temporal. */
function mockTemporalClients() {
  vi.spyOn(scheduleClient, "createOrUpdateAgentSchedule").mockResolvedValue(
    new Ok("workflow-id")
  );
  vi.spyOn(scheduleClient, "deleteTriggerSchedule").mockResolvedValue(
    new Ok(undefined)
  );
  vi.spyOn(
    wakeUpClient,
    "launchOrScheduleWakeUpTemporalWorkflow"
  ).mockResolvedValue(new Ok(undefined));
  vi.spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow").mockResolvedValue(
    new Ok(undefined)
  );
}

/**
 * A workspace the nightly run should visit: the feature is on and a threshold is set. A null
 * threshold leaves the setting absent, which is how a workspace says it wants no archival.
 */
async function createWorkspaceAskingForArchival({
  thresholdDays = THRESHOLD_DAYS,
  withFeature = true,
}: {
  thresholdDays?: number | null;
  withFeature?: boolean;
} = {}) {
  const { authenticator, workspace } = await createResourceTest({
    role: "admin",
  });

  if (withFeature) {
    await FeatureFlagFactory.basic(authenticator, "archive_inactive_agents");
  }

  await updateWorkspaceMetadata(workspace, {
    inactiveAgentArchivalThresholdDays: thresholdDays ?? undefined,
  });

  return { authenticator, workspace };
}

async function createUnusedAgent(
  auth: Authenticator,
  name: string,
  requestedSpaceIds: number[] = []
) {
  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    name,
    requestedSpaceIds,
  });
  await AgentConfigurationFactory.backdate(auth, agent.sId, LONG_AGO);

  return agent;
}

async function statusOf(auth: Authenticator, agentId: string) {
  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "light",
  });

  return agent?.status;
}

describe("getWorkspacesWithInactiveAgentArchivalActivity", () => {
  it("returns a workspace that asks for archival", async () => {
    const { workspace } = await createWorkspaceAskingForArchival();

    const workspaceIds = await getWorkspacesWithInactiveAgentArchivalActivity();

    expect(workspaceIds).toContain(workspace.sId);
  });

  it("leaves out a workspace with the feature but no threshold", async () => {
    const { workspace } = await createWorkspaceAskingForArchival({
      thresholdDays: null,
    });

    const workspaceIds = await getWorkspacesWithInactiveAgentArchivalActivity();

    expect(workspaceIds).not.toContain(workspace.sId);
  });

  it("leaves out a workspace with a threshold but not the feature", async () => {
    const { workspace } = await createWorkspaceAskingForArchival({
      withFeature: false,
    });

    const workspaceIds = await getWorkspacesWithInactiveAgentArchivalActivity();

    expect(workspaceIds).not.toContain(workspace.sId);
  });
});

describe("archiveWorkspaceInactiveAgentsActivity", () => {
  beforeEach(() => {
    mockTemporalClients();
  });

  it("archives an agent nobody has mentioned", async () => {
    const { authenticator, workspace } =
      await createWorkspaceAskingForArchival();
    const agent = await createUnusedAgent(authenticator, "Forgotten");

    const res = await archiveWorkspaceInactiveAgentsActivity({
      workspaceId: workspace.sId,
      evaluatedAtMs: Date.now(),
    });

    expect(res).toEqual({
      workspaceId: workspace.sId,
      thresholdDays: THRESHOLD_DAYS,
      archivedCount: 1,
      skippedCount: 0,
    });
    expect(await statusOf(authenticator, agent.sId)).toBe("archived");
  });

  it("archives an agent that requests a restricted space", async () => {
    // The admin's own actor cannot read it, so only a run that looks at every space archives it.
    const { authenticator, workspace } =
      await createWorkspaceAskingForArchival();
    const restrictedSpace = await SpaceFactory.regular(
      authenticator.getNonNullableWorkspace()
    );
    const agent = await createUnusedAgent(authenticator, "Private", [
      restrictedSpace.id,
    ]);

    const res = await archiveWorkspaceInactiveAgentsActivity({
      workspaceId: workspace.sId,
      evaluatedAtMs: Date.now(),
    });

    expect(res.archivedCount).toBe(1);
    expect(res.skippedCount).toBe(0);
    expect(await statusOf(authenticator, agent.sId)).toBeUndefined();
  });

  it("archives nothing once the workspace clears its threshold", async () => {
    const { authenticator, workspace } =
      await createWorkspaceAskingForArchival();
    const agent = await createUnusedAgent(authenticator, "Reprieved");

    await updateWorkspaceMetadata(workspace, {
      inactiveAgentArchivalThresholdDays: undefined,
    });

    const res = await archiveWorkspaceInactiveAgentsActivity({
      workspaceId: workspace.sId,
      evaluatedAtMs: Date.now(),
    });

    expect(res).toEqual({
      workspaceId: workspace.sId,
      thresholdDays: null,
      archivedCount: 0,
      skippedCount: 0,
    });
    expect(await statusOf(authenticator, agent.sId)).toBe("active");
  });

  it("fails without archiving when the stored threshold is out of range", async () => {
    const { authenticator, workspace } = await createWorkspaceAskingForArchival(
      { thresholdDays: 1 }
    );
    const agent = await createUnusedAgent(authenticator, "Saved by validation");

    await expect(
      archiveWorkspaceInactiveAgentsActivity({
        workspaceId: workspace.sId,
        evaluatedAtMs: Date.now(),
      })
    ).rejects.toThrow();

    expect(await statusOf(authenticator, agent.sId)).toBe("active");
  });

  it("archives nothing on a replay of the same instant", async () => {
    const { authenticator, workspace } =
      await createWorkspaceAskingForArchival();
    const agent = await createUnusedAgent(authenticator, "Forgotten twice");

    const input = {
      workspaceId: workspace.sId,
      evaluatedAtMs: Date.now(),
    };

    const first = await archiveWorkspaceInactiveAgentsActivity(input);
    expect(first.archivedCount).toBe(1);

    const replay = await archiveWorkspaceInactiveAgentsActivity(input);
    expect(replay.archivedCount).toBe(0);
    expect(await statusOf(authenticator, agent.sId)).toBe("archived");
  });

  it("leaves another workspace's agents alone", async () => {
    const swept = await createWorkspaceAskingForArchival();
    const untouched = await createWorkspaceAskingForArchival();

    await createUnusedAgent(swept.authenticator, "Swept");
    const spared = await createUnusedAgent(untouched.authenticator, "Spared");

    const res = await archiveWorkspaceInactiveAgentsActivity({
      workspaceId: swept.workspace.sId,
      evaluatedAtMs: Date.now(),
    });

    expect(res.archivedCount).toBe(1);
    expect(await statusOf(untouched.authenticator, spared.sId)).toBe("active");
  });
});
