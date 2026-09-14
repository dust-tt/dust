import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { ONE_DAY_MS } from "@app/lib/api/assistant/inactivity/policy";
import type { Authenticator } from "@app/lib/auth";
import * as scheduleClient from "@app/temporal/triggers/schedule_client";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MentionFactory } from "@app/tests/utils/MentionFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import {
  ArchiveInactiveAgentsResponseBodySchema,
  PreviewInactiveAgentsResponseBodySchema,
} from "@app/types/api/assistant/configuration";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const THRESHOLD_DAYS = 30;

/** Old enough to sit well before any cutoff a 30-day threshold can produce. */
const LONG_AGO = new Date(Date.now() - 90 * ONE_DAY_MS);

const ErrorBodySchema = z.object({
  error: z.object({ message: z.string() }),
});

// Parsing rather than casting also asserts the response actually matches its published contract.
async function previewBody(response: Response) {
  return PreviewInactiveAgentsResponseBodySchema.parse(await response.json())
    .preview;
}

async function archivalBody(response: Response) {
  return ArchiveInactiveAgentsResponseBodySchema.parse(await response.json())
    .archival;
}

async function errorBody(response: Response) {
  return ErrorBodySchema.parse(await response.json()).error;
}

async function setupTest({
  role = "admin",
  withFeatureFlag = true,
}: {
  role?: MembershipRoleType;
  withFeatureFlag?: boolean;
} = {}) {
  const { workspace, auth } = await createPrivateApiMockRequest({ role });

  if (withFeatureFlag) {
    await FeatureFlagFactory.basic(auth, "archive_inactive_agents");
  }

  return { workspace, auth };
}

function postPreview(wId: string, body: Record<string, unknown>) {
  return honoApp.request(
    `/api/w/${wId}/assistant/agent_configurations/archive_inactive/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function postArchive(wId: string, body: Record<string, unknown>) {
  return honoApp.request(
    `/api/w/${wId}/assistant/agent_configurations/archive_inactive`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

/** Creating an enabled schedule, and archiving, both reach Temporal. */
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

async function statusOf(auth: Authenticator, agentId: string) {
  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "light",
  });

  return agent?.status;
}

/** An agent old enough that only its mentions, triggers or status can save it. */
async function createAgedAgent(auth: Authenticator, name: string) {
  const agent = await AgentConfigurationFactory.createTestAgent(auth, { name });
  await AgentConfigurationFactory.backdate(auth, agent.sId, LONG_AGO);

  return agent;
}

describe("POST /api/w/:wId/assistant/agent_configurations/archive_inactive/preview", () => {
  beforeEach(() => {
    mockTemporalClients();
  });

  it("returns 403 for a non-admin member", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postPreview(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });

    expect(response.status).toBe(403);
  });

  it("returns 403 when the feature flag is off", async () => {
    const { workspace } = await setupTest({ withFeatureFlag: false });

    const response = await postPreview(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });

    expect(response.status).toBe(403);
    const { message } = await errorBody(response);
    expect(message).toMatch(/archive_inactive_agents/);
  });

  it("returns 400 for a threshold below the floor", async () => {
    const { workspace } = await setupTest();

    const response = await postPreview(workspace.sId, { thresholdDays: 1 });

    expect(response.status).toBe(400);
  });

  it("returns 400 for a threshold above the ceiling", async () => {
    const { workspace } = await setupTest();

    const response = await postPreview(workspace.sId, { thresholdDays: 367 });

    expect(response.status).toBe(400);
  });

  it("counts what the executor would archive, and why it would spare the rest", async () => {
    const { workspace, auth } = await setupTest();

    await createAgedAgent(auth, "Idle Agent");

    const recentlyUsed = await createAgedAgent(auth, "Recently Used Agent");
    await MentionFactory.agentMentionedAt(auth, {
      agentId: recentlyUsed.sId,
      mentionedAt: new Date(Date.now() - ONE_DAY_MS),
    });

    const scheduled = await createAgedAgent(auth, "Scheduled Agent");
    await TriggerFactory.schedule(auth, {
      agentConfigurationId: scheduled.sId,
      status: "enabled",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });

    // Not backdated: created now, so the age rule spares it.
    await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Fresh Agent",
    });

    // Editing inserts a new version; what counts is when the first one appeared.
    const edited = await createAgedAgent(auth, "Edited Agent");
    await AgentConfigurationFactory.updateTestAgent(auth, edited.sId, {
      name: "Edited Agent",
      instructions: "Freshly edited, still unused.",
    });

    const response = await postPreview(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });

    expect(response.status).toBe(200);
    const preview = await previewBody(response);

    expect(preview.eligibleCount).toBe(2);
    // "Recently Used Agent" is not counted: the candidates query filters on the same cutoff, so a
    // recently mentioned agent never reaches the rules to be spared by them.
    expect(preview.skippedCountByReason).toEqual({
      active_schedule: 1,
      recent_creation: 1,
    });
  });

  it("archives nothing", async () => {
    const { workspace, auth } = await setupTest();
    const agent = await createAgedAgent(auth, "Idle Agent");

    const first = await postPreview(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });
    expect((await previewBody(first)).eligibleCount).toBe(1);

    // Still active, and still counted a second time: a dry run reports, it does not act.
    const stillThere = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(stillThere?.status).toBe("active");

    const second = await postPreview(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });
    expect((await previewBody(second)).eligibleCount).toBe(1);
  });
});

describe("POST /api/w/:wId/assistant/agent_configurations/archive_inactive", () => {
  beforeEach(() => {
    mockTemporalClients();
  });

  it("returns 403 for a non-admin member", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postArchive(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });

    expect(response.status).toBe(403);
  });

  it("returns 403 when the feature flag is off", async () => {
    const { workspace, auth } = await setupTest({ withFeatureFlag: false });
    const agent = await createAgedAgent(auth, "Idle Agent");

    const response = await postArchive(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });

    expect(response.status).toBe(403);
    // The guard runs before anything is touched.
    expect(await statusOf(auth, agent.sId)).toBe("active");
  });

  it("returns 400 for a threshold outside the bounds", async () => {
    const { workspace } = await setupTest();

    const belowFloor = await postArchive(workspace.sId, { thresholdDays: 1 });
    expect(belowFloor.status).toBe(400);

    const aboveCeiling = await postArchive(workspace.sId, {
      thresholdDays: 367,
    });
    expect(aboveCeiling.status).toBe(400);
  });

  it("archives what the preview counted, and nothing else", async () => {
    const { workspace, auth } = await setupTest();

    const idle = await createAgedAgent(auth, "Idle Agent");

    const recentlyUsed = await createAgedAgent(auth, "Recently Used Agent");
    await MentionFactory.agentMentionedAt(auth, {
      agentId: recentlyUsed.sId,
      mentionedAt: new Date(Date.now() - ONE_DAY_MS),
    });

    const scheduled = await createAgedAgent(auth, "Scheduled Agent");
    await TriggerFactory.schedule(auth, {
      agentConfigurationId: scheduled.sId,
      status: "enabled",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });

    const fresh = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Fresh Agent",
    });

    const preview = await postPreview(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });
    const previewed = await previewBody(preview);

    const response = await postArchive(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });

    expect(response.status).toBe(200);
    const archival = await archivalBody(response);

    expect(archival.archivedCount).toBe(previewed.eligibleCount);
    expect(archival.archivedCount).toBe(1);
    // "Recently Used Agent" is spared without being counted: the candidates query already filtered
    // it out on the same cutoff.
    expect(archival.skippedCountByReason).toEqual({
      active_schedule: 1,
      recent_creation: 1,
    });

    expect(await statusOf(auth, idle.sId)).toBe("archived");
    expect(await statusOf(auth, recentlyUsed.sId)).toBe("active");
    expect(await statusOf(auth, scheduled.sId)).toBe("active");
    expect(await statusOf(auth, fresh.sId)).toBe("active");
  });

  it("archives nothing on a second call", async () => {
    // An archived agent is no longer active, so it is not a candidate again.
    const { workspace, auth } = await setupTest();
    await createAgedAgent(auth, "Idle Agent");

    const first = await postArchive(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });
    expect((await archivalBody(first)).archivedCount).toBe(1);

    const second = await postArchive(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });
    const archival = await archivalBody(second);
    expect(archival.archivedCount).toBe(0);
    expect(archival.skippedCountByReason).toEqual({});
  });

  it("archives the whole workspace in one call", async () => {
    const { workspace, auth } = await setupTest();
    const agents = [];
    for (const name of ["Idle A", "Idle B", "Idle C"]) {
      agents.push(await createAgedAgent(auth, name));
    }

    const response = await postArchive(workspace.sId, {
      thresholdDays: THRESHOLD_DAYS,
    });

    const archival = await archivalBody(response);
    expect(archival.archivedCount).toBe(3);

    for (const agent of agents) {
      expect(await statusOf(auth, agent.sId)).toBe("archived");
    }
  });
});
