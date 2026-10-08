import { getNotificationI18n } from "@app/lib/notifications/i18n";
import {
  buildSubscriptionCanceledEmailCopy,
  buildWorkspaceDataDeletionEmailCopy,
} from "@app/lib/notifications/workflows/subscription-lifecycle";
import { describe, expect, it } from "vitest";

describe("buildSubscriptionCanceledEmailCopy", () => {
  it("formats the end date in the recipient's locale", async () => {
    const payload = {
      workspaceId: "w_1",
      workspaceName: "Acme",
      endDate: "2026-11-05T12:00:00.000Z",
    };
    const fr = buildSubscriptionCanceledEmailCopy(
      await getNotificationI18n("fr-FR"),
      payload
    );
    const en = buildSubscriptionCanceledEmailCopy(
      await getNotificationI18n("en-US"),
      payload
    );

    expect(fr.content).toContain("le 5 nov. 2026");
    expect(en.content).toContain("on Nov 5, 2026");
    expect(en.action?.url).toMatch(/\/w\/w_1\/subscription$/);
  });
});

describe("buildWorkspaceDataDeletionEmailCopy", () => {
  it("pluralizes the remaining days and flags the last reminder", async () => {
    const en = await getNotificationI18n("en-US");
    const base = {
      workspaceId: "w_1",
      workspaceName: "Acme",
      isTrialEnd: false,
    };

    expect(
      buildWorkspaceDataDeletionEmailCopy(en, {
        ...base,
        remainingDays: 1,
        isLast: true,
      }).subject
    ).toBe("Last reminder: your Dust data will be deleted in 1 day");
    expect(
      buildWorkspaceDataDeletionEmailCopy(await getNotificationI18n("fr-FR"), {
        ...base,
        remainingDays: 15,
        isLast: false,
      }).subject
    ).toBe("Vos données Dust seront supprimées dans 15 jours");
  });
});
