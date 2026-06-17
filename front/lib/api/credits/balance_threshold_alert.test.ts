import { syncMetronomeBalanceThresholdAlert } from "@app/lib/api/credits/balance_threshold_alert";
import { getUsageConfiguration } from "@app/lib/api/credits/usage_configuration";
import { Authenticator } from "@app/lib/auth";
import * as balanceThreshold from "@app/lib/metronome/alerts/balance_threshold";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/alerts/balance_threshold", async () => {
  const actual = await vi.importActual<typeof balanceThreshold>(
    "@app/lib/metronome/alerts/balance_threshold"
  );
  return {
    ...actual,
    upsertMetronomeBalanceThresholdAlert: vi.fn(),
    clearMetronomeBalanceThresholdAlert: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";

beforeEach(() => {
  vi.mocked(
    balanceThreshold.upsertMetronomeBalanceThresholdAlert
  ).mockResolvedValue(new Ok({ alertId: "alert_xxx" }));
  vi.mocked(
    balanceThreshold.clearMetronomeBalanceThresholdAlert
  ).mockResolvedValue(new Ok(undefined));
});

describe("syncMetronomeBalanceThresholdAlert persistence", () => {
  it("persists the threshold to the configuration and upserts the alert", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncMetronomeBalanceThresholdAlert({
      auth,
      balanceThresholdCredits: 500,
    });

    expect((await getUsageConfiguration(auth)).balanceThresholdCredits).toBe(
      500
    );
    expect(
      balanceThreshold.upsertMetronomeBalanceThresholdAlert
    ).toHaveBeenCalled();
  });

  it("normalizes 0 to null and clears the alert", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncMetronomeBalanceThresholdAlert({
      auth,
      balanceThresholdCredits: 0,
    });

    expect((await getUsageConfiguration(auth)).balanceThresholdCredits).toBe(
      null
    );
    expect(
      balanceThreshold.clearMetronomeBalanceThresholdAlert
    ).toHaveBeenCalled();
    expect(
      balanceThreshold.upsertMetronomeBalanceThresholdAlert
    ).not.toHaveBeenCalled();
  });

  it("clears the stored threshold and the alert when set to null", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncMetronomeBalanceThresholdAlert({
      auth,
      balanceThresholdCredits: 500,
    });
    await syncMetronomeBalanceThresholdAlert({
      auth,
      balanceThresholdCredits: null,
    });

    expect((await getUsageConfiguration(auth)).balanceThresholdCredits).toBe(
      null
    );
    expect(
      balanceThreshold.clearMetronomeBalanceThresholdAlert
    ).toHaveBeenCalled();
  });

  it("returns an error but keeps the persisted threshold when the alert sync fails", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(
      balanceThreshold.upsertMetronomeBalanceThresholdAlert
    ).mockResolvedValue(new Err(new Error("metronome down")));

    const result = await syncMetronomeBalanceThresholdAlert({
      auth,
      balanceThresholdCredits: 500,
    });

    expect(result.isErr()).toBe(true);
    // Persist-first: the threshold is the source of truth, so it stays written
    // even when deriving the Metronome alert fails — the sync can be retried.
    expect((await getUsageConfiguration(auth)).balanceThresholdCredits).toBe(
      500
    );
  });
});
