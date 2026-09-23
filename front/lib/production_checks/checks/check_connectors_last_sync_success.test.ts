import { describe, expect, it } from "vitest";

import { isConnectorSyncFresh } from "./check_connectors_last_sync_success";

const NOW = new Date("2026-09-23T15:00:00.000Z").getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const EIGHT_DAYS_AGO = new Date(NOW - 8 * ONE_DAY_MS);
const THREE_DAYS_AGO = new Date(NOW - 3 * ONE_DAY_MS);

function connector(overrides: {
  lastSyncSuccessfulTime?: Date | null;
  lastSyncStartTime?: Date | null;
  createdAt?: Date;
}) {
  return {
    lastSyncSuccessfulTime: overrides.lastSyncSuccessfulTime ?? null,
    lastSyncStartTime: overrides.lastSyncStartTime ?? null,
    createdAt: overrides.createdAt ?? EIGHT_DAYS_AGO,
  };
}

describe("isConnectorSyncFresh", () => {
  it("is fresh when last successful sync is within a week", () => {
    expect(
      isConnectorSyncFresh({
        connector: connector({ lastSyncSuccessfulTime: THREE_DAYS_AGO }),
        now: NOW,
      })
    ).toBe(true);
  });

  it("is fresh when last sync start is within a week", () => {
    expect(
      isConnectorSyncFresh({
        connector: connector({ lastSyncStartTime: THREE_DAYS_AGO }),
        now: NOW,
      })
    ).toBe(true);
  });

  it("is fresh when the connector was created within a week", () => {
    expect(
      isConnectorSyncFresh({
        connector: connector({ createdAt: THREE_DAYS_AGO }),
        now: NOW,
      })
    ).toBe(true);
  });

  it("is stale when sync timestamps and createdAt are older than a week", () => {
    expect(
      isConnectorSyncFresh({
        connector: connector({}),
        now: NOW,
      })
    ).toBe(false);
  });

  it("is fresh when the active subscription started within a week even if sync is stale", () => {
    expect(
      isConnectorSyncFresh({
        connector: connector({}),
        subscriptionStartDate: THREE_DAYS_AGO,
        now: NOW,
      })
    ).toBe(true);
  });

  it("stays stale when the active subscription started more than a week ago", () => {
    expect(
      isConnectorSyncFresh({
        connector: connector({}),
        subscriptionStartDate: EIGHT_DAYS_AGO,
        now: NOW,
      })
    ).toBe(false);
  });

  it("stays stale when there is no active subscription", () => {
    expect(
      isConnectorSyncFresh({
        connector: connector({}),
        subscriptionStartDate: null,
        now: NOW,
      })
    ).toBe(false);
  });
});
