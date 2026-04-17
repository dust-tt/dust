import { isSeatBasedMetronomeContract } from "@app/lib/metronome/seats";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetMetronomeContractPackageAliases } = vi.hoisted(() => ({
  mockGetMetronomeContractPackageAliases: vi.fn(),
}));

vi.mock("@app/lib/metronome/client", () => ({
  getMetronomeContractPackageAliases: mockGetMetronomeContractPackageAliases,
  updateSubscriptionQuantity: vi.fn(),
}));

describe("isSeatBasedMetronomeContract", () => {
  beforeEach(() => {
    mockGetMetronomeContractPackageAliases.mockReset();
  });

  it("returns true for pro/business package aliases", async () => {
    mockGetMetronomeContractPackageAliases.mockResolvedValue(
      new Ok(["legacy-pro-monthly", "legacy-business-eur"])
    );

    const result = await isSeatBasedMetronomeContract({
      metronomeCustomerId: "m-customer",
      metronomeContractId: "m-contract",
    });

    expect(result.isOk()).toBe(true);
    expect(result.isErr()).toBe(false);
    if (result.isOk()) {
      expect(result.value).toBe(true);
    }
  });

  it("returns false for enterprise package aliases", async () => {
    mockGetMetronomeContractPackageAliases.mockResolvedValue(
      new Ok(["legacy-enterprise", "legacy-enterprise-eur"])
    );

    const result = await isSeatBasedMetronomeContract({
      metronomeCustomerId: "m-customer",
      metronomeContractId: "m-contract",
    });

    expect(result.isOk()).toBe(true);
    expect(result.isErr()).toBe(false);
    if (result.isOk()) {
      expect(result.value).toBe(false);
    }
  });

  it("returns Err when package alias lookup fails", async () => {
    mockGetMetronomeContractPackageAliases.mockResolvedValue(
      new Err(new Error("lookup failed"))
    );

    const result = await isSeatBasedMetronomeContract({
      metronomeCustomerId: "m-customer",
      metronomeContractId: "m-contract",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("lookup failed");
    }
  });
});
