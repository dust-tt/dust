import * as alerts from "@app/lib/metronome/alerts";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import {
  getMetronomeDefaultUserCapAlert,
  upsertMetronomeDefaultUserCapAlert,
} from "@app/lib/metronome/default_user_cap_alert";
import { mockCustomerAlert } from "@app/tests/utils/mocks/metronome";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/alerts", async () => {
  const actual = await vi.importActual<typeof alerts>(
    "@app/lib/metronome/alerts"
  );
  return {
    ...actual,
    findMetronomeAlert: vi.fn(),
    upsertMetronomeAlert: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const WORKSPACE_ID = "wks_test_xxx";

beforeEach(() => {
  vi.mocked(alerts.findMetronomeAlert).mockReset();
  vi.mocked(alerts.upsertMetronomeAlert).mockReset();
});

describe("getMetronomeDefaultUserCapAlert", () => {
  it("queries by the workspace-scoped uniqueness key", async () => {
    vi.mocked(alerts.findMetronomeAlert).mockResolvedValue(new Ok(null));

    await getMetronomeDefaultUserCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(alerts.findMetronomeAlert).toHaveBeenCalledWith({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      uniquenessKey: `default-user-cap-${WORKSPACE_ID}`,
    });
  });

  it("returns null when no alert is configured", async () => {
    vi.mocked(alerts.findMetronomeAlert).mockResolvedValue(new Ok(null));

    const result = await getMetronomeDefaultUserCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBeNull();
    }
  });

  it("returns the alert when configured", async () => {
    const alert = mockCustomerAlert({
      id: "alert_default_xxx",
      threshold: 50_000,
      customer_status: "ok",
      uniqueness_key: `default-user-cap-${WORKSPACE_ID}`,
    });
    vi.mocked(alerts.findMetronomeAlert).mockResolvedValue(new Ok(alert));

    const result = await getMetronomeDefaultUserCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(alert);
    }
  });

  it("propagates Metronome errors", async () => {
    vi.mocked(alerts.findMetronomeAlert).mockResolvedValue(
      new Err(new Error("metronome down"))
    );

    const result = await getMetronomeDefaultUserCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("metronome down");
    }
  });
});

describe("upsertMetronomeDefaultUserCapAlert", () => {
  it("upserts a spend_threshold_reached alert with a no-value user_id group fan-out", async () => {
    vi.mocked(alerts.upsertMetronomeAlert).mockResolvedValue(
      new Ok({ alertId: "alert_default_xxx" })
    );

    const result = await upsertMetronomeDefaultUserCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      awuCredits: 50_000,
    });

    expect(result.isOk()).toBe(true);
    expect(alerts.upsertMetronomeAlert).toHaveBeenCalledWith({
      alert_type: "spend_threshold_reached",
      name: `Default per-user cap ${WORKSPACE_ID} (50000 AWU)`,
      threshold: 50_000,
      credit_type_id: getCreditTypeAwuId(),
      customer_id: METRONOME_CUSTOMER_ID,
      // Fan-out marker: `user_id` key with no `value` tells Metronome to
      // emit one event per user that crosses the threshold.
      group_values: [{ key: "user_id" }],
      uniqueness_key: `default-user-cap-${WORKSPACE_ID}`,
    });
  });

  it("returns the alert id on success", async () => {
    vi.mocked(alerts.upsertMetronomeAlert).mockResolvedValue(
      new Ok({ alertId: "alert_default_xxx" })
    );

    const result = await upsertMetronomeDefaultUserCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      awuCredits: 50_000,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ alertId: "alert_default_xxx" });
    }
  });

  it("propagates Metronome errors", async () => {
    vi.mocked(alerts.upsertMetronomeAlert).mockResolvedValue(
      new Err(new Error("metronome down"))
    );

    const result = await upsertMetronomeDefaultUserCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      awuCredits: 50_000,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("metronome down");
    }
  });
});
