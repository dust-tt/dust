import { areGroupLimitsEnabled } from "@app/lib/api/groups/group_limit_eligibility";
import { Authenticator } from "@app/lib/auth";
import * as planType from "@app/lib/metronome/plan_type";
import * as seatTypes from "@app/lib/metronome/seat_types";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import type { SeatFixture } from "@app/tests/utils/metronome_contracts";
import { buildCachedContractMock } from "@app/tests/utils/metronome_contracts";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual<typeof planType>(
    "@app/lib/metronome/plan_type"
  );
  return { ...actual, getActiveContract: vi.fn() };
});

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<typeof seatTypes>(
    "@app/lib/metronome/seat_types"
  );
  return { ...actual, getProductSeatTypes: vi.fn() };
});

const POOLED_SEATS: SeatFixture[] = [
  { seatType: "workspace_yearly", entitled: true },
  { seatType: "pro" },
  { seatType: "free" },
];

const SEAT_BASED_SEATS: SeatFixture[] = [
  { seatType: "pro_yearly", entitled: true },
  { seatType: "workspace_yearly" },
];

function mockContract(seats: SeatFixture[]) {
  const { contract, productSeatTypes } = buildCachedContractMock({ seats });
  vi.mocked(planType.getActiveContract).mockResolvedValue(contract);
  vi.mocked(seatTypes.getProductSeatTypes).mockResolvedValue(productSeatTypes);
}

async function creditPricedAuth({ withFlag }: { withFlag: boolean }) {
  const workspace = await WorkspaceFactory.creditPriced();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  if (withFlag) {
    await FeatureFlagFactory.basic(auth, "group_limits");
  }
  return Authenticator.internalAdminForWorkspace(workspace.sId);
}

describe("areGroupLimitsEnabled", () => {
  beforeEach(() => {
    vi.mocked(planType.getActiveContract).mockReset();
    vi.mocked(seatTypes.getProductSeatTypes).mockReset();
  });

  it("is enabled on a pool-only contract with the flag on", async () => {
    mockContract(POOLED_SEATS);
    const auth = await creditPricedAuth({ withFlag: true });

    expect(await areGroupLimitsEnabled(auth)).toBe(true);
  });

  it("is disabled when the flag is off", async () => {
    mockContract(POOLED_SEATS);
    const auth = await creditPricedAuth({ withFlag: false });

    expect(await areGroupLimitsEnabled(auth)).toBe(false);
  });

  it("is disabled when the contract sells personal-credit seats", async () => {
    mockContract(SEAT_BASED_SEATS);
    const auth = await creditPricedAuth({ withFlag: true });

    expect(await areGroupLimitsEnabled(auth)).toBe(false);
  });

  it("is disabled when the active contract cannot be resolved", async () => {
    vi.mocked(planType.getActiveContract).mockResolvedValue(null);
    const auth = await creditPricedAuth({ withFlag: true });

    expect(await areGroupLimitsEnabled(auth)).toBe(false);
  });

  it("is disabled on a workspace that is not credit-priced", async () => {
    mockContract(POOLED_SEATS);
    const workspace = await WorkspaceFactory.basic();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(adminAuth, "group_limits");
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    expect(await areGroupLimitsEnabled(auth)).toBe(false);
    expect(planType.getActiveContract).not.toHaveBeenCalled();
  });
});
