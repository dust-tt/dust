import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { buildBalanceThresholdReachedEmailCopy } from "@app/lib/notifications/workflows/balance-threshold-reached";
import { describe, expect, it } from "vitest";

const PAYLOAD = {
  balanceThresholdCredits: 1500,
  remainingBalanceCredits: 1200,
  isEnterprise: false,
};

describe("buildBalanceThresholdReachedEmailCopy", () => {
  it("renders the copy in English", async () => {
    const { subject, content, actionLabel } =
      buildBalanceThresholdReachedEmailCopy(
        await getNotificationI18n("en-US"),
        PAYLOAD
      );

    expect(subject).toBe(
      "[Dust] Credit balance alert - your workspace balance dropped below 1,500 credits"
    );
    expect(content).toContain("Remaining balance: 1,200 credits");
    expect(actionLabel).toBe("See usage details");
  });

  it("renders the copy in French with localized numbers", async () => {
    const { subject, actionLabel } = buildBalanceThresholdReachedEmailCopy(
      await getNotificationI18n("fr-FR"),
      { ...PAYLOAD, isEnterprise: true }
    );

    expect(subject).toBe(
      "[Dust] Alerte de solde\u00a0: le solde de crédits de votre workspace est passé sous 1 500 crédits"
    );
    expect(actionLabel).toBe("Gérer les crédits");
  });
});
