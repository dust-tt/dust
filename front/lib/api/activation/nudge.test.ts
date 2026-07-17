import {
  getActivationNudgeFrequencyCapDays,
  isEligibleForNudge,
} from "@app/lib/api/activation/nudge";
import { Authenticator } from "@app/lib/auth";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS } from "@app/temporal/activation_scheduler/config";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

describe("getActivationNudgeFrequencyCapDays", () => {
  it("falls back to the default when the workspace has no override", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    expect(getActivationNudgeFrequencyCapDays(authenticator)).toBe(
      DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS
    );
  });

  it("uses the workspace-configured override when valid", async () => {
    const { workspace } = await createResourceTest({
      role: "admin",
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      activationNudgeFrequencyCapDays: 30,
    });
    const refreshedAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    expect(getActivationNudgeFrequencyCapDays(refreshedAuth)).toBe(30);
  });

  it("falls back to the default when the override is not a number", async () => {
    const { workspace } = await createResourceTest({
      role: "admin",
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      activationNudgeFrequencyCapDays: "not-a-number",
    });
    const refreshedAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    expect(getActivationNudgeFrequencyCapDays(refreshedAuth)).toBe(
      DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS
    );
  });
});

describe("isEligibleForNudge", () => {
  it("is eligible when the pod has never been nudged", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });

    expect(await isEligibleForNudge(authenticator, globalSpace)).toBe(true);
  });

  it("is not eligible right after a nudge, within the cap window", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const trigger = await TriggerFactory.webhook(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    });
    await ActivationNudgeResource.makeNew(authenticator, {
      pod: globalSpace,
      trigger,
    });

    expect(await isEligibleForNudge(authenticator, globalSpace)).toBe(false);
  });
});
