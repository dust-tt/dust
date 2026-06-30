import * as alerts from "@app/lib/metronome/alerts";
import {
  clearMetronomeApiKeyCapAlert,
  upsertMetronomeApiKeyCapAlert,
} from "@app/lib/metronome/alerts/api_key_caps";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/alerts", async () => {
  const actual = await vi.importActual<typeof alerts>(
    "@app/lib/metronome/alerts"
  );
  return {
    ...actual,
    clearMetronomeAlert: vi.fn(),
    upsertMetronomeAlert: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const WORKSPACE_ID = "wks_test_xxx";
const KEY_NAME = "my-key";

beforeEach(() => {
  vi.mocked(alerts.clearMetronomeAlert).mockReset();
  vi.mocked(alerts.upsertMetronomeAlert).mockReset();
});

describe("upsertMetronomeApiKeyCapAlert", () => {
  it("creates a spend_threshold_reached alert scoped to api_key_name", async () => {
    vi.mocked(alerts.upsertMetronomeAlert).mockResolvedValue(
      new Ok({ alertId: "al_123" })
    );

    const result = await upsertMetronomeApiKeyCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      keyName: KEY_NAME,
      awuCredits: 100,
    });

    expect(result.isOk()).toBe(true);
    expect(alerts.upsertMetronomeAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alert_type: "spend_threshold_reached",
        threshold: 100,
        credit_type_id: getCreditTypeAwuId(),
        customer_id: METRONOME_CUSTOMER_ID,
        group_values: [{ key: "api_key_name", value: KEY_NAME }],
        uniqueness_key: `per-api-key-cap-${WORKSPACE_ID}-${KEY_NAME}`,
      })
    );
  });

  it("propagates the upsert error", async () => {
    vi.mocked(alerts.upsertMetronomeAlert).mockResolvedValue(
      new Err(new Error("metronome down"))
    );

    const result = await upsertMetronomeApiKeyCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      keyName: KEY_NAME,
      awuCredits: 100,
    });

    expect(result.isErr()).toBe(true);
  });
});

describe("clearMetronomeApiKeyCapAlert", () => {
  it("archives the alert by its workspace+name uniqueness key", async () => {
    vi.mocked(alerts.clearMetronomeAlert).mockResolvedValue(new Ok(null));

    const result = await clearMetronomeApiKeyCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      keyName: KEY_NAME,
    });

    expect(result.isOk()).toBe(true);
    expect(alerts.clearMetronomeAlert).toHaveBeenCalledWith({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      uniquenessKey: `per-api-key-cap-${WORKSPACE_ID}-${KEY_NAME}`,
    });
  });

  it("propagates the clear error", async () => {
    vi.mocked(alerts.clearMetronomeAlert).mockResolvedValue(
      new Err(new Error("metronome down"))
    );

    const result = await clearMetronomeApiKeyCapAlert({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      keyName: KEY_NAME,
    });

    expect(result.isErr()).toBe(true);
  });
});
