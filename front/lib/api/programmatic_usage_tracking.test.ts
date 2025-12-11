import { beforeEach, describe, expect, it } from "vitest";

import {
  compareCreditsForConsumption,
  decreaseProgrammaticCreditsV2,
} from "@app/lib/api/programmatic_usage_tracking";
import { Authenticator } from "@app/lib/auth";
import { CreditResource } from "@app/lib/resources/credit_resource";
import logger from "@app/logger/logger";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types";

describe("compareCreditsForConsumption", () => {
  const NOW = new Date();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  function makeMockCredit(
    type: "free" | "payg" | "committed",
    expirationDate: Date
  ): CreditResource {
    return { type, expirationDate } as CreditResource;
  }

  describe("type ordering", () => {
    it("should prioritize free credits over payg", () => {
      const free = makeMockCredit("free", NOW);
      const payg = makeMockCredit("payg", NOW);

      expect(compareCreditsForConsumption(free, payg)).toBeLessThan(0);
      expect(compareCreditsForConsumption(payg, free)).toBeGreaterThan(0);
    });

    it("should prioritize free credits over committed", () => {
      const free = makeMockCredit("free", NOW);
      const committed = makeMockCredit("committed", NOW);

      expect(compareCreditsForConsumption(free, committed)).toBeLessThan(0);
      expect(compareCreditsForConsumption(committed, free)).toBeGreaterThan(0);
    });

    it("should prioritize committed over payg", () => {
      const committed = makeMockCredit("committed", NOW);
      const payg = makeMockCredit("payg", NOW);

      expect(compareCreditsForConsumption(committed, payg)).toBeLessThan(0);
      expect(compareCreditsForConsumption(payg, committed)).toBeGreaterThan(0);
    });
  });

  describe("expiration date ordering within same type", () => {
    it("should prioritize earlier expiration dates for free credits", () => {
      const earlier = makeMockCredit("free", NOW);
      const later = makeMockCredit("free", new Date(NOW.getTime() + ONE_DAY));

      expect(compareCreditsForConsumption(earlier, later)).toBeLessThan(0);
      expect(compareCreditsForConsumption(later, earlier)).toBeGreaterThan(0);
    });

    it("should prioritize earlier expiration dates for payg credits", () => {
      const earlier = makeMockCredit("payg", NOW);
      const later = makeMockCredit("payg", new Date(NOW.getTime() + ONE_DAY));

      expect(compareCreditsForConsumption(earlier, later)).toBeLessThan(0);
      expect(compareCreditsForConsumption(later, earlier)).toBeGreaterThan(0);
    });

    it("should prioritize earlier expiration dates for committed credits", () => {
      const earlier = makeMockCredit("committed", NOW);
      const later = makeMockCredit(
        "committed",
        new Date(NOW.getTime() + ONE_DAY)
      );

      expect(compareCreditsForConsumption(earlier, later)).toBeLessThan(0);
      expect(compareCreditsForConsumption(later, earlier)).toBeGreaterThan(0);
    });

    it("should return 0 for credits with same type and expiration date", () => {
      const credit1 = makeMockCredit("free", NOW);
      const credit2 = makeMockCredit("free", NOW);

      expect(compareCreditsForConsumption(credit1, credit2)).toBe(0);
    });
  });

  describe("type takes precedence over expiration date", () => {
    it("should prioritize free over payg even with later expiration", () => {
      const free = makeMockCredit(
        "free",
        new Date(NOW.getTime() + 30 * ONE_DAY)
      );
      const payg = makeMockCredit("payg", NOW);

      expect(compareCreditsForConsumption(free, payg)).toBeLessThan(0);
    });

    it("should prioritize committed over payg even with later expiration", () => {
      const committed = makeMockCredit(
        "committed",
        new Date(NOW.getTime() + 30 * ONE_DAY)
      );
      const payg = makeMockCredit("payg", NOW);

      expect(compareCreditsForConsumption(committed, payg)).toBeLessThan(0);
    });
  });

  describe("sorting an array of credits", () => {
    it("should sort credits correctly: free first, then committed, then payg, by expiration", () => {
      const credits = [
        makeMockCredit("committed", new Date(NOW.getTime() + ONE_DAY)),
        makeMockCredit("payg", new Date(NOW.getTime() + 2 * ONE_DAY)),
        makeMockCredit("free", new Date(NOW.getTime() + 3 * ONE_DAY)),
        makeMockCredit("committed", NOW),
        makeMockCredit("payg", NOW),
        makeMockCredit("free", NOW),
      ];

      const sorted = [...credits].sort(compareCreditsForConsumption);

      // Free credits first (by expiration)
      expect(sorted[0].type).toBe("free");
      expect(sorted[0].expirationDate).toEqual(NOW);
      expect(sorted[1].type).toBe("free");

      // Then committed (by expiration)
      expect(sorted[2].type).toBe("committed");
      expect(sorted[2].expirationDate).toEqual(NOW);
      expect(sorted[3].type).toBe("committed");

      // Then payg (by expiration)
      expect(sorted[4].type).toBe("payg");
      expect(sorted[4].expirationDate).toEqual(NOW);
      expect(sorted[5].type).toBe("payg");
    });
  });
});

describe("decreaseProgrammaticCreditsV2", () => {
  const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;
  const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
  const TWO_MONTHS = 60 * 24 * 60 * 60 * 1000;

  let workspace: WorkspaceType;
  let auth: Authenticator;

  const testLogger = logger.child({
    workspaceId: "test-workspace-id",
    agentMessageId: "test-agent-message-id",
    agentMessageVersion: 1,
    conversationId: 123,
    userMessageId: "test-user-message-id",
    userMessageVersion: 1,
  });

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    await GroupFactory.defaults(workspace);
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
  });

  async function createCredit(
    type: "free" | "payg" | "committed",
    initialAmountMicroUsd: number,
    expirationDate: Date
  ): Promise<CreditResource> {
    const credit = await CreditResource.makeNew(auth, {
      type,
      initialAmountMicroUsd,
      consumedAmountMicroUsd: 0,
    });
    // Use a start date clearly in the past to avoid timing issues
    const startDate = new Date(Date.now() - 1000);
    await credit.start(auth, {
      startDate,
      expirationDate,
    });
    return credit;
  }

  async function refreshCredit(
    credit: CreditResource
  ): Promise<CreditResource> {
    const refreshed = await CreditResource.fetchById(
      auth,
      credit.id.toString()
    );
    if (!refreshed) {
      throw new Error("Credit not found");
    }
    return refreshed;
  }

  describe("basic consumption", () => {
    it("should consume from a single credit", async () => {
      const credit = await createCredit(
        "free",
        10_000_000,
        new Date(Date.now() + ONE_YEAR)
      );

      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 3_000_000,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });

      const refreshed = await refreshCredit(credit);
      expect(refreshed.consumedAmountMicroUsd).toBe(3_000_000);
    });

    it("should fully consume a credit and stop", async () => {
      const credit = await createCredit(
        "free",
        5_000_000,
        new Date(Date.now() + ONE_YEAR)
      );

      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 10_000_000,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });

      const refreshed = await refreshCredit(credit);
      expect(refreshed.consumedAmountMicroUsd).toBe(5_000_000);
    });

    it("should not throw when no credits are available", async () => {
      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 10_000_000,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });
      // Should complete without error
    });

    it("should do nothing when amount is zero", async () => {
      const credit = await createCredit(
        "free",
        10_000_000,
        new Date(Date.now() + ONE_YEAR)
      );

      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 0,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });

      const refreshed = await refreshCredit(credit);
      expect(refreshed.consumedAmountMicroUsd).toBe(0);
    });
  });

  describe("consumption order by type", () => {
    it("should consume free credits before payg", async () => {
      const freeCredit = await createCredit(
        "free",
        5_000_000,
        new Date(Date.now() + ONE_YEAR)
      );
      const paygCredit = await createCredit(
        "payg",
        5_000_000,
        new Date(Date.now() + ONE_YEAR)
      );

      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 3_000_000,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });

      const refreshedFree = await refreshCredit(freeCredit);
      const refreshedPayg = await refreshCredit(paygCredit);

      expect(refreshedFree.consumedAmountMicroUsd).toBe(3_000_000);
      expect(refreshedPayg.consumedAmountMicroUsd).toBe(0);
    });

    it("should consume committed credits before payg", async () => {
      const committedCredit = await createCredit(
        "committed",
        5_000_000,
        new Date(Date.now() + ONE_YEAR)
      );
      const paygCredit = await createCredit(
        "payg",
        5_000_000,
        new Date(Date.now() + ONE_YEAR)
      );

      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 3_000_000,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });

      const refreshedCommitted = await refreshCredit(committedCredit);
      const refreshedPayg = await refreshCredit(paygCredit);

      expect(refreshedCommitted.consumedAmountMicroUsd).toBe(3_000_000);
      expect(refreshedPayg.consumedAmountMicroUsd).toBe(0);
    });

    it("should consume in order: free -> committed -> payg", async () => {
      const freeCredit = await createCredit(
        "free",
        2_000_000,
        new Date(Date.now() + ONE_YEAR)
      );
      const committedCredit = await createCredit(
        "committed",
        2_000_000,
        new Date(Date.now() + ONE_YEAR)
      );
      const paygCredit = await createCredit(
        "payg",
        2_000_000,
        new Date(Date.now() + ONE_YEAR)
      );

      // Consume 500 cents - should go through:
      // 1. freeCredit (200)
      // 2. committedCredit (200)
      // 3. paygCredit (100)
      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 5_000_000,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });

      const refreshedFree = await refreshCredit(freeCredit);
      const refreshedCommitted = await refreshCredit(committedCredit);
      const refreshedPayg = await refreshCredit(paygCredit);

      expect(refreshedFree.consumedAmountMicroUsd).toBe(2_000_000);
      expect(refreshedCommitted.consumedAmountMicroUsd).toBe(2_000_000);
      expect(refreshedPayg.consumedAmountMicroUsd).toBe(1_000_000);
    });
  });

  describe("consumption order by expiration date", () => {
    it("should consume earlier-expiring credits first within same type", async () => {
      const earlierCredit = await createCredit(
        "free",
        5_000_000,
        new Date(Date.now() + ONE_MONTH)
      );
      const laterCredit = await createCredit(
        "free",
        5_000_000,
        new Date(Date.now() + TWO_MONTHS)
      );

      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 3_000_000,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });

      const refreshedEarlier = await refreshCredit(earlierCredit);
      const refreshedLater = await refreshCredit(laterCredit);

      expect(refreshedEarlier.consumedAmountMicroUsd).toBe(3_000_000);
      expect(refreshedLater.consumedAmountMicroUsd).toBe(0);
    });

    it("should spill over to later-expiring credits when earlier ones are exhausted", async () => {
      const earlierCredit = await createCredit(
        "free",
        2_000_000,
        new Date(Date.now() + ONE_MONTH)
      );
      const laterCredit = await createCredit(
        "free",
        5_000_000,
        new Date(Date.now() + TWO_MONTHS)
      );

      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 5_000_000,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });

      const refreshedEarlier = await refreshCredit(earlierCredit);
      const refreshedLater = await refreshCredit(laterCredit);

      expect(refreshedEarlier.consumedAmountMicroUsd).toBe(2_000_000);
      expect(refreshedLater.consumedAmountMicroUsd).toBe(3_000_000);
    });
  });

  describe("mixed type and expiration scenarios", () => {
    it("should prioritize type over expiration date", async () => {
      // Payg expires sooner than free
      const paygCredit = await createCredit(
        "payg",
        5_000_000,
        new Date(Date.now() + ONE_MONTH)
      );
      const freeCredit = await createCredit(
        "free",
        5_000_000,
        new Date(Date.now() + 6 * ONE_MONTH)
      );

      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 3_000_000,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });

      const refreshedPayg = await refreshCredit(paygCredit);
      const refreshedFree = await refreshCredit(freeCredit);

      // Free should be consumed first despite later expiration
      expect(refreshedFree.consumedAmountMicroUsd).toBe(3_000_000);
      expect(refreshedPayg.consumedAmountMicroUsd).toBe(0);
    });

    it("should handle complex scenario with multiple credits of each type", async () => {
      // Create credits in non-sorted order
      const paygLater = await createCredit(
        "payg",
        1_000_000,
        new Date(Date.now() + TWO_MONTHS)
      );
      const freeEarlier = await createCredit(
        "free",
        1_000_000,
        new Date(Date.now() + ONE_MONTH)
      );
      const committedEarlier = await createCredit(
        "committed",
        1_000_000,
        new Date(Date.now() + ONE_MONTH)
      );
      const freeLater = await createCredit(
        "free",
        1_000_000,
        new Date(Date.now() + TWO_MONTHS)
      );
      const paygEarlier = await createCredit(
        "payg",
        1_000_000,
        new Date(Date.now() + ONE_MONTH)
      );

      // Consume 350 cents - should go through (order: free -> committed -> payg):
      // 1. freeEarlier (100)
      // 2. freeLater (100)
      // 3. committedEarlier (100)
      // 4. paygEarlier (50)
      await decreaseProgrammaticCreditsV2(auth, {
        amountMicroUsd: 3_500_000,
        localLogger: testLogger,
        userMessageOrigin: "api",
      });

      const refreshedFreeEarlier = await refreshCredit(freeEarlier);
      const refreshedFreeLater = await refreshCredit(freeLater);
      const refreshedCommittedEarlier = await refreshCredit(committedEarlier);
      const refreshedPaygEarlier = await refreshCredit(paygEarlier);
      const refreshedPaygLater = await refreshCredit(paygLater);

      expect(refreshedFreeEarlier.consumedAmountMicroUsd).toBe(1_000_000);
      expect(refreshedFreeLater.consumedAmountMicroUsd).toBe(1_000_000);
      expect(refreshedCommittedEarlier.consumedAmountMicroUsd).toBe(1_000_000);
      expect(refreshedPaygEarlier.consumedAmountMicroUsd).toBe(500_000);
      expect(refreshedPaygLater.consumedAmountMicroUsd).toBe(0);
    });
  });
});
