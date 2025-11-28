import { beforeEach, describe, expect, it } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";

describe("PAYG Credits Database Tests", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;
  });

  // Requires migration_419.sql to be run (unique index on type, workspaceId, startDate, expirationDate)
  describe("unique constraint on (type, workspaceId, startDate, expirationDate)", () => {
    it("should throw when creating duplicate credits with same dates", async () => {
      const startTimestampSeconds = 1700000000;
      const endTimestampSeconds = 1702678400;
      const startDate = new Date(startTimestampSeconds * 1000);
      const expirationDate = new Date(endTimestampSeconds * 1000);

      const credit1 = await CreditResource.makeNew(auth, {
        type: "payg",
        initialAmountCents: 1000,
        consumedAmountCents: 0,
      });
      await credit1.start(startDate, expirationDate);

      const credit2 = await CreditResource.makeNew(auth, {
        type: "payg",
        initialAmountCents: 2000,
        consumedAmountCents: 0,
      });

      await expect(credit2.start(startDate, expirationDate)).rejects.toThrow(
        /unique|Validation error/i
      );
    });
  });

  describe("timestamp precision", () => {
    it("should find credit by exact timestamp seconds", async () => {
      const startTimestampSeconds = 1700000000;
      const endTimestampSeconds = 1702678400;
      const startDate = new Date(startTimestampSeconds * 1000);
      const expirationDate = new Date(endTimestampSeconds * 1000);

      const credit = await CreditResource.makeNew(auth, {
        type: "payg",
        initialAmountCents: 1000,
        consumedAmountCents: 0,
      });
      await credit.start(startDate, expirationDate);

      const lookupStartDate = new Date(startTimestampSeconds * 1000);
      const lookupExpirationDate = new Date(endTimestampSeconds * 1000);

      const found = await CreditResource.fetchByTypeAndDates(
        auth,
        "payg",
        lookupStartDate,
        lookupExpirationDate
      );

      expect(found).not.toBeNull();
      expect(found?.id).toBe(credit.id);
    });
  });
});
