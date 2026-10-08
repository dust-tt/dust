import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { buildWorkspaceInvitationEmailCopy } from "@app/lib/notifications/workflows/workspace-invitation";
import { describe, expect, it } from "vitest";

describe("buildWorkspaceInvitationEmailCopy", () => {
  it("renders the invitation in the recipient's locale", async () => {
    const payload = {
      workspaceName: "Acme",
      inviterName: "Ada",
      isReminder: false,
    };
    const fr = buildWorkspaceInvitationEmailCopy(
      await getNotificationI18n("fr-FR"),
      payload
    );
    const en = buildWorkspaceInvitationEmailCopy(
      await getNotificationI18n("en-US"),
      payload
    );

    expect(fr.subject).toBe("[Dust] Ada vous invite à rejoindre Acme");
    expect(fr.actionLabel).toBe("Accepter l’invitation");
    expect(en.subject).toBe("[Dust] Ada invited you to join Acme");
  });

  it("uses the reminder copy without naming the inviter", async () => {
    const en = buildWorkspaceInvitationEmailCopy(
      await getNotificationI18n("en-US"),
      { workspaceName: "Acme", inviterName: null, isReminder: true }
    );

    expect(en.subject).toBe("[Dust] Reminder: you're invited to join Acme");
  });
});
