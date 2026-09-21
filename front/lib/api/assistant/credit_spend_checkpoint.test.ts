import {
  getCreditSpendCheckpointConfig,
  hasCrossedCreditSpendCheckpoint,
  hasReachedCreditSpendCheckpoint,
  isExemptFromCreditSpendCheckpoint,
  resolveDefaultCreditSpendCheckpointEnabled,
} from "@app/lib/api/assistant/credit_spend_checkpoint";
import { Authenticator } from "@app/lib/auth";
import { MODEL_COST_MICRO_USD_PER_AWU_CREDIT } from "@app/lib/metronome/constants";
import { CREDIT_PRICED_BUSINESS_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { DEFAULT_CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/resources/storage/models/credit_usage_configurations";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { PlanType } from "@app/types/plan";
import { describe, expect, it } from "vitest";

describe("isExemptFromCreditSpendCheckpoint", () => {
  it("is exempt when there is no user to answer the pause", async () => {
    const { workspace } = await createResourceTest({});
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    expect(
      isExemptFromCreditSpendCheckpoint(auth, { userMessageOrigin: "web" })
    ).toBe(true);
  });

  it("is exempt when the origin is unknown", async () => {
    const { authenticator: auth } = await createResourceTest({});

    expect(
      isExemptFromCreditSpendCheckpoint(auth, { userMessageOrigin: null })
    ).toBe(true);
  });

  it.each([
    "api",
    "email",
    "slack",
    "triggered",
    "wakeup",
    "transcript",
    "zendesk",
    "project_kickoff",
    "cli",
  ] as const)("is exempt for %s: the author cannot resume the pause from a Dust client", async (origin) => {
    const { authenticator: auth } = await createResourceTest({});

    expect(
      isExemptFromCreditSpendCheckpoint(auth, { userMessageOrigin: origin })
    ).toBe(true);
  });

  it.each([
    "web",
    "extension",
  ] as const)("is not exempt for %s: the author is in a Dust client UI", async (origin) => {
    const { authenticator: auth } = await createResourceTest({});

    expect(
      isExemptFromCreditSpendCheckpoint(auth, { userMessageOrigin: origin })
    ).toBe(false);
  });
});

describe("hasReachedCreditSpendCheckpoint", () => {
  const thresholdAwuCredits = 200;
  const thresholdMicroUsd =
    thresholdAwuCredits * MODEL_COST_MICRO_USD_PER_AWU_CREDIT;

  it("is false while the spend is below the threshold", () => {
    expect(
      hasReachedCreditSpendCheckpoint({
        totalCostMicroUsd:
          thresholdMicroUsd - MODEL_COST_MICRO_USD_PER_AWU_CREDIT,
        thresholdAwuCredits,
      })
    ).toBe(false);
  });

  it("is true once the spend reaches the threshold", () => {
    expect(
      hasReachedCreditSpendCheckpoint({
        totalCostMicroUsd: thresholdMicroUsd,
        thresholdAwuCredits,
      })
    ).toBe(true);
  });
});

describe("resolveDefaultCreditSpendCheckpointEnabled", () => {
  it("is true when there is no plan", () => {
    expect(resolveDefaultCreditSpendCheckpointEnabled(null)).toBe(true);
  });

  it("is false for a credit-priced plan", () => {
    const plan = { code: CREDIT_PRICED_BUSINESS_PLAN_CODE } as PlanType;
    expect(resolveDefaultCreditSpendCheckpointEnabled(plan)).toBe(false);
  });

  it("is true for a non-credit-priced plan", () => {
    const plan = { code: "PRO_PLAN_SEAT_29" } as PlanType;
    expect(resolveDefaultCreditSpendCheckpointEnabled(plan)).toBe(true);
  });
});

describe("getCreditSpendCheckpointConfig", () => {
  it("falls back to the plan default and the global default threshold when no override exists", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    expect(await getCreditSpendCheckpointConfig(auth)).toEqual({
      enabled: true,
      thresholdAwuCredits:
        DEFAULT_CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS,
    });
  });

  it("defaults to disabled for a credit-priced workspace with no override", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    expect(await getCreditSpendCheckpointConfig(auth)).toEqual({
      enabled: false,
      thresholdAwuCredits:
        DEFAULT_CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS,
    });
  });

  it("uses the workspace's explicit overrides over the plan and global defaults", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const createResult = await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      usageCapCredits: null,
      creditSpendCheckpointEnabled: true,
      creditSpendCheckpointThresholdAwuCredits: 500,
    });
    expect(createResult.isOk()).toBe(true);

    expect(await getCreditSpendCheckpointConfig(auth)).toEqual({
      enabled: true,
      thresholdAwuCredits: 500,
    });
  });
});

describe("hasCrossedCreditSpendCheckpoint", () => {
  it("is false when exempt, whatever the status", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: true,
        isRootAgentMessage: true,
        status: null,
      })
    ).toBe(false);
  });

  it("is false for a sub-agent message, whatever the status", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: false,
        isRootAgentMessage: false,
        status: null,
      })
    ).toBe(false);
  });

  it("is false once acknowledged", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: false,
        isRootAgentMessage: true,
        status: "acknowledged",
      })
    ).toBe(false);
  });

  it("is true for a pausable root message with no prior status", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: false,
        isRootAgentMessage: true,
        status: null,
      })
    ).toBe(true);
  });

  it("is true for a pausable root message already flagged paused", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: false,
        isRootAgentMessage: true,
        status: "paused",
      })
    ).toBe(true);
  });

  it("is false once stopped", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: false,
        isRootAgentMessage: true,
        status: "stopped",
      })
    ).toBe(false);
  });
});
