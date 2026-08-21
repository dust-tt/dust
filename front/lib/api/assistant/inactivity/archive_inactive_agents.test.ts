import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { archiveInactiveWorkspaceAgents } from "@app/lib/api/assistant/inactivity/archive_inactive_agents";
import { ONE_DAY_MS } from "@app/lib/api/assistant/inactivity/policy";
import type { Authenticator } from "@app/lib/auth";
import * as scheduleClient from "@app/temporal/triggers/schedule_client";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MentionFactory } from "@app/tests/utils/MentionFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
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

async function createUnusedAgent(auth: Authenticator, name: string) {
  const agent = await AgentConfigurationFactory.createTestAgent(auth, { name });
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

describe("archiveInactiveWorkspaceAgents", () => {
  beforeEach(() => {
    mockTemporalClients();
  });

  it("archives an agent nobody has mentioned", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createUnusedAgent(authenticator, "Forgotten");

    const res = await archiveInactiveWorkspaceAgents(authenticator, {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
    });

    expect(res.isOk()).toBe(true);
    expect(res.isOk() && res.value.archivedAgentIds).toEqual([agent.sId]);
    expect(res.isOk() && res.value.skipped).toEqual([]);
    expect(await statusOf(authenticator, agent.sId)).toBe("archived");
  });

  it("archives nothing on a replay of the same input", async () => {
    // A retried activity re-runs the fetch, and an archived agent is no longer a candidate.
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createUnusedAgent(authenticator, "Forgotten twice");

    const input = {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
    };

    const first = await archiveInactiveWorkspaceAgents(authenticator, input);
    expect(first.isOk() && first.value.archivedAgentIds).toEqual([agent.sId]);

    const replay = await archiveInactiveWorkspaceAgents(authenticator, input);
    expect(replay.isOk() && replay.value.archivedAgentIds).toEqual([]);
    expect(await statusOf(authenticator, agent.sId)).toBe("archived");
  });

  it("leaves an agent an enabled schedule still drives", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createUnusedAgent(authenticator, "Scheduled");
    await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      status: "enabled",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });

    const res = await archiveInactiveWorkspaceAgents(authenticator, {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
    });

    expect(res.isOk() && res.value.archivedAgentIds).toEqual([]);
    expect(res.isOk() && res.value.skipped).toEqual([
      { agentId: agent.sId, reason: "active_schedule" },
    ]);
    expect(await statusOf(authenticator, agent.sId)).toBe("active");
  });

  it("leaves an agent someone mentioned since the cutoff", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createUnusedAgent(authenticator, "Still wanted");
    await MentionFactory.agentMentionedAt(authenticator, {
      agentId: agent.sId,
      mentionedAt: new Date(),
    });

    const res = await archiveInactiveWorkspaceAgents(authenticator, {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
    });

    expect(res.isOk() && res.value.archivedAgentIds).toEqual([]);
    expect(await statusOf(authenticator, agent.sId)).toBe("active");
  });

  it("archives nothing when the threshold is unusable", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createUnusedAgent(authenticator, "Saved by validation");

    const res = await archiveInactiveWorkspaceAgents(authenticator, {
      thresholdDays: 1,
      evaluatedAt: new Date(),
    });

    expect(res.isErr()).toBe(true);
    expect(res.isErr() && res.error.type).toBe("invalid_threshold");
    expect(await statusOf(authenticator, agent.sId)).toBe("active");
  });

  it("archives every eligible agent of the workspace in one call", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await createUnusedAgent(authenticator, "Idle one");
    await createUnusedAgent(authenticator, "Idle two");

    const scheduled = await createUnusedAgent(authenticator, "Scheduled");
    await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: scheduled.sId,
      status: "enabled",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });

    const res = await archiveInactiveWorkspaceAgents(authenticator, {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
    });
    if (res.isErr()) {
      throw res.error;
    }

    expect(res.value.archivedAgentIds).toHaveLength(2);
    expect(res.value.skipped).toEqual([
      { agentId: scheduled.sId, reason: "active_schedule" },
    ]);

    // A second call has nothing left: the archived ones are no longer candidates.
    const again = await archiveInactiveWorkspaceAgents(authenticator, {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
    });

    expect(again.isOk() && again.value.archivedAgentIds).toEqual([]);
  });
});
