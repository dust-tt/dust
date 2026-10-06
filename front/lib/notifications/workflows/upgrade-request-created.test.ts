import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { buildUpgradeRequestCreatedEmailCopy } from "@app/lib/notifications/workflows/upgrade-request-created";
import { describe, expect, it } from "vitest";

const REQUEST = {
  workspaceId: "w_1",
  workspaceName: "Acme",
  requesterName: "Ada",
  requesterEmail: null,
  reason: "Big project",
};

describe("buildUpgradeRequestCreatedEmailCopy", () => {
  it("renders a single request in English", async () => {
    const { subject, content, actionLabel } =
      buildUpgradeRequestCreatedEmailCopy(await getNotificationI18n("en-US"), [
        REQUEST,
      ]);

    expect(subject).toBe("[Dust] Ada requested a spend-limit upgrade");
    expect(content).toContain(
      "Ada has reached their per-user spend limit and is requesting an upgrade (reason: Big project)."
    );
    expect(actionLabel).toBe("Review request");
  });

  it("renders several requests in French", async () => {
    const { subject, actionLabel } = buildUpgradeRequestCreatedEmailCopy(
      await getNotificationI18n("fr-FR"),
      [REQUEST, { ...REQUEST, requesterName: "Grace" }]
    );

    expect(subject).toBe(
      "[Dust] 2 membres ont demandé une augmentation de leur limite de dépenses"
    );
    expect(actionLabel).toBe("Examiner les demandes");
  });
});
