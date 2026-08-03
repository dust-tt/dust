import { z } from "zod";

export type GetMetronomeContractResponseBody = {
  contract: MetronomeContractSummary | null;
};

export const PatchMetronomeContractRequestBody = z.object({
  action: z.enum(["cancel", "reactivate"]),
});

export type MetronomeContractSummary = {
  planFamily: "pro" | "enterprise";
  /** ms epoch — set when the contract is scheduled to end (cancellation or fixed term). */
  contractEndingAtMs: number | null;
  /** True if the contract has at least one seat-billed subscription */
  hasSeatSubscription: boolean;
  /**
   * True if the contract sells at least one seat type that carries a personal
   * (per-user) credit allocation — pro/max/free seats. Such users spend their
   * personal credits before falling back to the shared workspace pool, so they
   * keep working even when the pool is depleted/in overage. False for
   * pool-based contracts (workspace seats only) and MAU contracts.
   */
  hasPersonalCreditSeats: boolean;
};
