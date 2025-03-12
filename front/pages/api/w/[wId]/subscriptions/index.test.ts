import { describe, expect } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

describe("POST /api/w/[wId]/subscriptions", () => {
  itInTransaction("returns 400 on invalid request body", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      invalidField: "invalid",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  itInTransaction(
    "returns checkoutUrl and plan details for new subscription",
    async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      req.body = {
        billingPeriod: "monthly",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.checkoutUrl).toMatch(/^https:\/\/.+/); // Should be a valid URL
      expect(data.plan).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          name: expect.any(String),
          limits: expect.objectContaining({
            users: expect.objectContaining({
              maxUsers: expect.any(Number),
            }),
            dataSources: expect.any(Object),
          }),
        })
      );
    }
  );

  itInTransaction("handles yearly billing period", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      billingPeriod: "yearly",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.checkoutUrl).toMatch(/^https:\/\/.+/);
    expect(data.plan).toBeDefined();
  });

  itInTransaction("returns 403 when user is not admin", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    req.body = {
      billingPeriod: "monthly",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });
});
