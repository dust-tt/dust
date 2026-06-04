import type { CheckoutPayment } from "@app/lib/credits/checkout_payment_status";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { describe, expect, it, vi } from "vitest";

import handler from "./checkout-payment-status";

const MOCK_SETUP_SESSION_ID = "cs_test_setup_session_123";
const MOCK_CONTRACT_ID = "contract_abc";

const mockPendingPayment: CheckoutPayment = {
  status: "pending",
  workspaceId: "ws_test",
  setupSessionId: MOCK_SETUP_SESSION_ID,
  contractId: MOCK_CONTRACT_ID,
  userId: "user_123",
  targetUserId: "user_123",
  seatType: "pro",
  billingPeriod: "monthly",
  currency: "usd",
  initialAmountCents: 3000,
  uniquenessKey: `checkout-payment-ws_test-${MOCK_SETUP_SESSION_ID}`,
  createdAtMs: 1717497600000,
};

vi.mock("@app/lib/credits/checkout_payment_status", () => ({
  getCheckoutPaymentStatus: vi.fn(),
}));

import { getCheckoutPaymentStatus } from "@app/lib/credits/checkout_payment_status";

describe("GET /api/w/[wId]/subscriptions/checkout/checkout-payment-status", () => {
  it("returns 403 for non-admin users", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    req.query = { ...req.query, setup_session_id: MOCK_SETUP_SESSION_ID };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it("returns 405 for non-GET methods", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    req.query = { ...req.query, setup_session_id: MOCK_SETUP_SESSION_ID };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 400 when setup_session_id is missing", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns null checkoutPayment when getCheckoutPaymentStatus returns null", async () => {
    vi.mocked(getCheckoutPaymentStatus).mockResolvedValue(null);

    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    req.query = { ...req.query, setup_session_id: MOCK_SETUP_SESSION_ID };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().checkoutPayment).toBeNull();
  });

  it("returns pending checkoutPayment when found", async () => {
    vi.mocked(getCheckoutPaymentStatus).mockResolvedValue(mockPendingPayment);

    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    req.query = { ...req.query, setup_session_id: MOCK_SETUP_SESSION_ID };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { checkoutPayment } = res._getJSONData();
    expect(checkoutPayment.status).toBe("pending");
    expect(checkoutPayment.setupSessionId).toBe(MOCK_SETUP_SESSION_ID);
    expect(checkoutPayment.seatType).toBe("pro");
    expect(checkoutPayment.billingPeriod).toBe("monthly");
  });

  it("returns succeeded checkoutPayment when found", async () => {
    vi.mocked(getCheckoutPaymentStatus).mockResolvedValue({
      ...mockPendingPayment,
      status: "succeeded",
      invoiceId: "in_test_invoice",
    });

    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    req.query = { ...req.query, setup_session_id: MOCK_SETUP_SESSION_ID };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { checkoutPayment } = res._getJSONData();
    expect(checkoutPayment.status).toBe("succeeded");
    expect(checkoutPayment.invoiceId).toBe("in_test_invoice");
  });

  it("passes the correct workspaceId and setupSessionId to getCheckoutPaymentStatus", async () => {
    vi.mocked(getCheckoutPaymentStatus).mockResolvedValue(null);

    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    req.query = { ...req.query, setup_session_id: MOCK_SETUP_SESSION_ID };

    await handler(req, res);

    expect(getCheckoutPaymentStatus).toHaveBeenCalledWith({
      workspaceId: workspace.sId,
      setupSessionId: MOCK_SETUP_SESSION_ID,
    });
  });
});
