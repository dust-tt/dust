import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { buildSeatAutoUpgradedEmailCopy } from "@app/lib/notifications/workflows/seat-auto-upgraded";
import { describe, expect, it } from "vitest";

const MEMBER = {
  workspaceId: "w_1",
  workspaceName: "Acme",
  memberName: "Ada",
  memberEmail: null,
  previousSeatType: "pro",
  newSeatType: "max",
};

describe("buildSeatAutoUpgradedEmailCopy", () => {
  it("renders the copy in the recipient's locale", async () => {
    const fr = buildSeatAutoUpgradedEmailCopy(
      await getNotificationI18n("fr-FR"),
      [MEMBER]
    );
    const en = buildSeatAutoUpgradedEmailCopy(
      await getNotificationI18n("en-US"),
      [MEMBER]
    );

    expect(fr.subject).toBe(
      "[Dust] Ada est passé automatiquement à un siège max"
    );
    expect(en.subject).toBe("[Dust] Ada was auto-upgraded to a max seat");
  });
});
