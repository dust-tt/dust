import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { archiveInactiveWorkspaceAgents } from "@app/lib/api/assistant/inactivity/archive_inactive_agents";
import type { Authenticator } from "@app/lib/auth";
import * as scheduleClient from "@app/temporal/triggers/schedule_client";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MentionFactory } from "@app/tests/utils/MentionFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
  await AgentConfigurationFactory.setCreatedAtForTest(
    auth,
    agent.sId,
    LONG_AGO
  );

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
      page: { cursor: null, limit: 50 },
    });

    expect(res.isOk()).toBe(true);
    expect(res.isOk() && res.value.archivedAgentIds).toEqual([agent.sId]);
    expect(res.isOk() && res.value.skipped).toEqual([]);
    expect(await statusOf(authenticator, agent.sId)).toBe("archived");
  });

  it("archives nothing on a replay of the same input", async () => {
    // A Temporal retry replays its input verbatim. The archived agent is no longer active, so it does
    // not come back from the fetch at all: it cannot be archived twice, and no second
    // `agent.archived` audit event is emitted.
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await createUnusedAgent(authenticator, "Forgotten twice");

    const input = {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
      page: { cursor: null, limit: 50 },
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
      page: { cursor: null, limit: 50 },
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
      page: { cursor: null, limit: 50 },
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
      page: { cursor: null, limit: 50 },
    });

    expect(res.isErr()).toBe(true);
    expect(res.isErr() && res.error.type).toBe("invalid_threshold");
    expect(await statusOf(authenticator, agent.sId)).toBe("active");
  });

  it("advances past agents it cannot archive, so a driver terminates", async () => {
    // The failure this guards: agents the rules always refuse stay candidates forever, so a driver
    // that did not advance its cursor would be handed the same page for eternity and never reach the
    // rest of the workspace.
    const { authenticator } = await createResourceTest({ role: "admin" });
    for (const name of ["Scheduled one", "Scheduled two"]) {
      const agent = await createUnusedAgent(authenticator, name);
      await TriggerFactory.schedule(authenticator, {
        agentConfigurationId: agent.sId,
        status: "enabled",
        configuration: { cron: "0 9 * * *", timezone: "UTC" },
      });
    }

    const skippedAgentIds: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const res = await archiveInactiveWorkspaceAgents(authenticator, {
        thresholdDays: THRESHOLD_DAYS,
        evaluatedAt: new Date(),
        // One at a time, so a cursor that failed to advance would loop forever rather than hiding
        // behind a page big enough to hold everything.
        page: { cursor, limit: 1 },
      });
      if (res.isErr()) {
        throw res.error;
      }

      expect(res.value.archivedAgentIds).toEqual([]);
      skippedAgentIds.push(...res.value.skipped.map(({ agentId }) => agentId));
      cursor = res.value.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 5);

    expect(cursor).toBeNull();
    // Each agent was seen once, and both were reached.
    expect(new Set(skippedAgentIds).size).toBe(2);
    expect(skippedAgentIds).toHaveLength(2);
  });

  it("reports a cursor so the caller can drive the next page", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await createUnusedAgent(authenticator, "Page one");
    await createUnusedAgent(authenticator, "Page two");

    const firstPage = await archiveInactiveWorkspaceAgents(authenticator, {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
      page: { cursor: null, limit: 1 },
    });

    expect(firstPage.isOk() && firstPage.value.archivedAgentIds).toHaveLength(
      1
    );
    const nextCursor = firstPage.isOk() ? firstPage.value.nextCursor : null;
    expect(nextCursor).not.toBeNull();

    const secondPage = await archiveInactiveWorkspaceAgents(authenticator, {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
      page: { cursor: nextCursor, limit: 1 },
    });

    expect(secondPage.isOk() && secondPage.value.archivedAgentIds).toHaveLength(
      1
    );
    expect(secondPage.isOk() && secondPage.value.nextCursor).toBeNull();
  });
});
