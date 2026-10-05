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

  it("pluralizes the digest copy for several members", async () => {
    const members = [MEMBER, { ...MEMBER, memberName: "Grace" }];
    const fr = buildSeatAutoUpgradedEmailCopy(
      await getNotificationI18n("fr-FR"),
      members
    );
    const en = buildSeatAutoUpgradedEmailCopy(
      await getNotificationI18n("en-US"),
      members
    );

    expect(fr.subject).toBe(
      "[Dust] 2 membres sont passés automatiquement à des sièges supérieurs"
    );
    expect(en.subject).toBe(
      "[Dust] 2 members were auto-upgraded to higher seats"
    );
  });
});
