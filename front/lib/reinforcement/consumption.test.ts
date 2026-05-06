import type { Authenticator } from "@app/lib/auth";
import { DEFAULT_REINFORCEMENT_CAP_MICRO_USD } from "@app/lib/reinforcement/constants";
import { getReinforcementMonthlyCapMicroUsd } from "@app/lib/reinforcement/consumption";
import { describe, expect, it } from "vitest";

function makeAuth(
  workspaceSId: string,
  metadata?: { reinforcementCapMicroUsd?: number }
): Authenticator {
  return {
    getNonNullableWorkspace: () => ({
      sId: workspaceSId,
      metadata: metadata ?? null,
    }),
  } as unknown as Authenticator;
}

describe("getReinforcementMonthlyCapMicroUsd", () => {
  it("returns default cap when workspace has no metadata", () => {
    const auth = makeAuth("ws-1");
    expect(getReinforcementMonthlyCapMicroUsd(auth)).toBe(
      DEFAULT_REINFORCEMENT_CAP_MICRO_USD
    );
  });

  it("returns default cap when metadata has no reinforcementCapMicroUsd", () => {
    const auth = makeAuth("ws-1", {});
    expect(getReinforcementMonthlyCapMicroUsd(auth)).toBe(
      DEFAULT_REINFORCEMENT_CAP_MICRO_USD
    );
  });

  it("returns workspace override when set", () => {
    const auth = makeAuth("ws-1", { reinforcementCapMicroUsd: 50_000_000 });
    expect(getReinforcementMonthlyCapMicroUsd(auth)).toBe(50_000_000);
  });

  it("allows cap of 0", () => {
    const auth = makeAuth("ws-1", { reinforcementCapMicroUsd: 0 });
    expect(getReinforcementMonthlyCapMicroUsd(auth)).toBe(0);
  });
});
