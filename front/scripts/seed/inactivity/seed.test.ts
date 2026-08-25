import { previewInactiveAgents } from "@app/lib/api/assistant/inactivity/preview_inactive_agents";
import type { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { SeedContext } from "@app/scripts/seed/factories";
import { seedInactivity } from "@app/scripts/seed/inactivity/seedInactivity";
import * as scheduleClient from "@app/temporal/triggers/schedule_client";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const THRESHOLD_DAYS = 30;

describe("inactivity seed script integration test", () => {
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let authenticator: Authenticator;
  let ctx: SeedContext;

  beforeEach(async () => {
    const testResources = await createResourceTest({ role: "admin" });
    workspace = testResources.workspace;
    user = testResources.user;
    authenticator = testResources.authenticator;

    ctx = { auth: authenticator, workspace, user, execute: true, logger };

    // The seeded schedule is enabled, which reaches Temporal.
    vi.spyOn(scheduleClient, "createOrUpdateAgentSchedule").mockResolvedValue(
      new Ok("workflow-id")
    );
  });

  it("builds a workspace whose archival answer is the documented one", async () => {
    await seedInactivity(ctx);

    const res = await previewInactiveAgents(authenticator, {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
    });
    if (res.isErr()) {
      throw res.error;
    }

    // The README's promise: two archivable, and each of the others held back by its own rule.
    expect(res.value.eligibleAgentIds).toHaveLength(2);
    expect(res.value.skipped).toHaveLength(2);
    expect(res.value.skipped.map(({ reason }) => reason).sort()).toEqual([
      "active_schedule",
      "recent_creation",
    ]);
  });

  it("enables the feature flag the endpoints need", async () => {
    await seedInactivity(ctx);

    const flags = await FeatureFlagResource.listForWorkspace(workspace);

    expect(flags.map(({ name }) => name)).toContain("archive_inactive_agents");
  });

  it("gives the same answer when run twice", async () => {
    // Re-running must not create a second set of agents, nor a second version of the edited one:
    // either would move the counts.
    await seedInactivity(ctx);
    await seedInactivity(ctx);

    const res = await previewInactiveAgents(authenticator, {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
    });
    if (res.isErr()) {
      throw res.error;
    }

    expect(res.value.eligibleAgentIds).toHaveLength(2);
    expect(res.value.skipped).toHaveLength(2);
  });

  it("changes nothing without --execute", async () => {
    await seedInactivity({ ...ctx, execute: false });

    const res = await previewInactiveAgents(authenticator, {
      thresholdDays: THRESHOLD_DAYS,
      evaluatedAt: new Date(),
    });
    if (res.isErr()) {
      throw res.error;
    }

    expect(res.value.eligibleAgentIds).toEqual([]);
    expect(res.value.skipped).toEqual([]);
  });
});
