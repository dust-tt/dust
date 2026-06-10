import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Redis store shared across all mock calls within a test.
const store: Map<string, string> = new Map();

vi.mock("@app/lib/api/redis", () => ({
  runOnRedisCache: vi.fn(
    async (_opts: unknown, fn: (cli: unknown) => Promise<unknown>) => {
      const cli = {
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: string) => {
          store.set(key, value);
        },
      };
      return fn(cli);
    }
  ),
}));

import {
  getCheckoutPaymentStatus,
  markCheckoutPaymentFailed,
  markCheckoutPaymentSucceeded,
  recordCheckoutPaymentSyncFailure,
  setCheckoutPaymentPending,
} from "@app/lib/credits/checkout_payment_status";
import { BUSINESS_USD_PACKAGE_ALIAS } from "@app/lib/metronome/types";

const BASE_INPUT = {
  workspaceId: "ws_test",
  contractId: "contract_abc",
  userId: "user_1",
  targetUserId: "user_2",
  seatType: "pro" as const,
  billingPeriod: "monthly" as const,
  currency: "usd" as const,
  initialAmountCents: 3000,
  metronomePackageAlias: BUSINESS_USD_PACKAGE_ALIAS,
  planCode: "CP_BUSINESS_PLAN",
  uniquenessKey: "checkout-payment-ws_test-contract_abc",
};

describe("checkout_payment_status Redis helpers", () => {
  beforeEach(() => {
    store.clear();
  });

  describe("setCheckoutPaymentPending", () => {
    it("stores a pending entry with correct fields", async () => {
      await setCheckoutPaymentPending(BASE_INPUT);

      const result = await getCheckoutPaymentStatus({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe("pending");
      expect(result!.workspaceId).toBe(BASE_INPUT.workspaceId);
      expect(result!.contractId).toBe(BASE_INPUT.contractId);
      expect(result!.seatType).toBe("pro");
      expect(result!.billingPeriod).toBe("monthly");
      expect(result!.currency).toBe("usd");
      expect(result!.initialAmountCents).toBe(3000);
      expect(typeof result!.createdAtMs).toBe("number");
    });

    it("keys entries by workspaceId + contractId", async () => {
      await setCheckoutPaymentPending(BASE_INPUT);
      await setCheckoutPaymentPending({
        ...BASE_INPUT,
        contractId: "contract_other",
      });

      const first = await getCheckoutPaymentStatus({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
      });
      const second = await getCheckoutPaymentStatus({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: "contract_other",
      });

      expect(first!.contractId).toBe("contract_abc");
      expect(second!.contractId).toBe("contract_other");
    });
  });

  describe("getCheckoutPaymentStatus", () => {
    it("returns null when no entry exists", async () => {
      const result = await getCheckoutPaymentStatus({
        workspaceId: "ws_test",
        contractId: "contract_nonexistent",
      });
      expect(result).toBeNull();
    });
  });

  describe("markCheckoutPaymentSucceeded", () => {
    it("updates status to succeeded and stores invoiceId", async () => {
      await setCheckoutPaymentPending(BASE_INPUT);

      const result = await markCheckoutPaymentSucceeded({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
        invoiceId: "in_invoice_1",
      });

      expect(result!.status).toBe("succeeded");
      expect(result!.invoiceId).toBe("in_invoice_1");

      const stored = await getCheckoutPaymentStatus({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
      });
      expect(stored!.status).toBe("succeeded");
    });

    it("returns null when no entry exists", async () => {
      const result = await markCheckoutPaymentSucceeded({
        workspaceId: "ws_test",
        contractId: "contract_nonexistent",
        invoiceId: "in_1",
      });
      expect(result).toBeNull();
    });

    it("is idempotent: second success does not overwrite the first", async () => {
      await setCheckoutPaymentPending(BASE_INPUT);

      await markCheckoutPaymentSucceeded({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
        invoiceId: "in_first",
      });

      const second = await markCheckoutPaymentSucceeded({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
        invoiceId: "in_second",
      });

      // Returns the existing succeeded entry unchanged.
      expect(second!.invoiceId).toBe("in_first");

      const stored = await getCheckoutPaymentStatus({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
      });
      expect(stored!.invoiceId).toBe("in_first");
    });
  });

  describe("markCheckoutPaymentFailed", () => {
    it("updates status to failed with errorMessage", async () => {
      await setCheckoutPaymentPending(BASE_INPUT);

      const result = await markCheckoutPaymentFailed({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
        errorMessage: "Card declined",
      });

      expect(result!.status).toBe("failed");
      expect(result!.errorMessage).toBe("Card declined");
    });

    it("stores invoiceId when provided", async () => {
      await setCheckoutPaymentPending(BASE_INPUT);

      const result = await markCheckoutPaymentFailed({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
        errorMessage: "Insufficient funds",
        invoiceId: "in_failed",
      });

      expect(result!.invoiceId).toBe("in_failed");
    });

    it("does not overwrite a succeeded entry", async () => {
      await setCheckoutPaymentPending(BASE_INPUT);
      await markCheckoutPaymentSucceeded({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
        invoiceId: "in_1",
      });

      const result = await markCheckoutPaymentFailed({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
        errorMessage: "late failure",
      });

      // updatePayment guards on status === "succeeded".
      expect(result!.status).toBe("succeeded");

      const stored = await getCheckoutPaymentStatus({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
      });
      expect(stored!.status).toBe("succeeded");
    });
  });

  describe("recordCheckoutPaymentSyncFailure", () => {
    it("marks a pending entry as failed unconditionally", async () => {
      await setCheckoutPaymentPending(BASE_INPUT);

      await recordCheckoutPaymentSyncFailure({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
        errorMessage: "Metronome call failed",
      });

      const stored = await getCheckoutPaymentStatus({
        workspaceId: BASE_INPUT.workspaceId,
        contractId: BASE_INPUT.contractId,
      });
      expect(stored!.status).toBe("failed");
      expect(stored!.errorMessage).toBe("Metronome call failed");
    });

    it("is a no-op when no entry exists", async () => {
      await expect(
        recordCheckoutPaymentSyncFailure({
          workspaceId: "ws_test",
          contractId: "contract_nonexistent",
          errorMessage: "error",
        })
      ).resolves.toBeUndefined();
    });
  });
});
