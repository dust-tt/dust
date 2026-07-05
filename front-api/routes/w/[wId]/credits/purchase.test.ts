import * as limits from "@app/lib/credits/limits";
import * as contracts from "@app/lib/metronome/contracts";
import * as stripe from "@app/lib/plans/stripe";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual<typeof stripe>("@app/lib/plans/stripe");
  return { ...actual, getStripePricingData: vi.fn() };
});

vi.mock("@app/lib/metronome/contracts", async () => {
  const actual = await vi.importActual<typeof contracts>(
    "@app/lib/metronome/contracts"
  );
  return { ...actual, resolveCurrencyForExistingMetronomeCustomer: vi.fn() };
});

vi.mock("@app/lib/credits/limits", async () => {
  const actual = await vi.importActual<typeof limits>(
    "@app/lib/credits/limits"
  );
  return { ...actual, getCreditPurchaseLimits: vi.fn() };
});

function purchaseUrl(wId: string) {
  return `/api/w/${wId}/credits/purchase`;
}

const PURCHASE_LIMITS = {
  canPurchase: true as const,
  maxAmountMicroUsd: 1_000_000_000,
};

beforeEach(() => {
  vi.mocked(stripe.getStripePricingData).mockResolvedValue(null);
  vi.mocked(
    contracts.resolveCurrencyForExistingMetronomeCustomer
  ).mockResolvedValue(new Ok("usd"));
  vi.mocked(limits.getCreditPurchaseLimits).mockResolvedValue(PURCHASE_LIMITS);
});

describe("/api/w/[wId]/credits/purchase", () => {
  describe("GET (business-admin-readable)", () => {
    it("returns 403 when the caller is a user", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const response = await honoApp.request(purchaseUrl(workspace.sId));

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    });

    it("allows a business admin to read purchase info", async () => {
      const workspace = await WorkspaceFactory.creditPriced();
      await createPrivateApiMockRequest({
        method: "GET",
        role: "business_admin",
        workspace,
      });

      const response = await honoApp.request(purchaseUrl(workspace.sId));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.currency).toBe("usd");
      expect(body.discountPercent).toBe(0);
      expect(body.creditPurchaseLimits).toEqual(PURCHASE_LIMITS);
    });

    it("allows an admin to read purchase info", async () => {
      const workspace = await WorkspaceFactory.creditPriced();
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(purchaseUrl(workspace.sId));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.currency).toBe("usd");
      expect(body.discountPercent).toBe(0);
      expect(body.creditPurchaseLimits).toEqual(PURCHASE_LIMITS);
    });
  });

  describe("POST (admin-only write)", () => {
    it("returns 403 for a business admin", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "business_admin",
      });

      const response = await honoApp.request(purchaseUrl(workspace.sId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountDollars: 1 }),
      });

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    });

    it("returns 403 for a regular user", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const response = await honoApp.request(purchaseUrl(workspace.sId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountDollars: 1 }),
      });

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    });
  });
});
