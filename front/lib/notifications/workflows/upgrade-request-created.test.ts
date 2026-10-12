import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { buildUpgradeRequestCreatedEmailCopy } from "@app/lib/notifications/workflows/upgrade-request-created";
import { makeUpgradeRequestCreatedPayload } from "@app/tests/utils/UpgradeRequestCreatedPayloadFactory";
import { describe, expect, it } from "vitest";

describe("buildUpgradeRequestCreatedEmailCopy", () => {
  it("renders a single request in English", async () => {
    const { subject, content, actionLabel } =
      buildUpgradeRequestCreatedEmailCopy(await getNotificationI18n("en-US"), [
        makeUpgradeRequestCreatedPayload(),
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
      [
        makeUpgradeRequestCreatedPayload(),
        makeUpgradeRequestCreatedPayload({ requesterName: "Grace" }),
      ]
    );

    expect(subject).toBe(
      "[Dust] 2 membres ont demandé une augmentation de leur limite de dépenses"
    );
    expect(actionLabel).toBe("Examiner les demandes");
  });

  it("treats a payload without a cause as a personal limit request", async () => {
    const { subject } = buildUpgradeRequestCreatedEmailCopy(
      await getNotificationI18n("en-US"),
      [makeUpgradeRequestCreatedPayload()]
    );

    expect(subject).toBe("[Dust] Ada requested a spend-limit upgrade");
  });

  it("renders a group budget raise request", async () => {
    const { subject, content } = buildUpgradeRequestCreatedEmailCopy(
      await getNotificationI18n("en-US"),
      [
        makeUpgradeRequestCreatedPayload({
          cause: "group_shared_limit",
          groupName: "Sales",
        }),
      ]
    );

    expect(subject).toBe("[Dust] Ada requested a raise of the Sales budget");
    expect(content).toContain(
      "Ada is blocked because the Sales group budget is used up, and is requesting a raise."
    );
    expect(content).toContain("Reason: Big project");
    expect(content).not.toContain("per-user spend limit");
  });

  it("renders a group budget raise request without a group name", async () => {
    const { subject } = buildUpgradeRequestCreatedEmailCopy(
      await getNotificationI18n("en-US"),
      [
        makeUpgradeRequestCreatedPayload({
          cause: "group_shared_limit",
          groupName: null,
        }),
      ]
    );

    expect(subject).toBe("[Dust] Ada requested a group budget raise");
  });

  it("renders a seat request", async () => {
    const { subject, content } = buildUpgradeRequestCreatedEmailCopy(
      await getNotificationI18n("en-US"),
      [makeUpgradeRequestCreatedPayload({ cause: "no_seat" })]
    );

    expect(subject).toBe("[Dust] Ada requested a seat");
    expect(content).toContain("Ada has no seat and is requesting one.");
  });

  it("lists what each member asks for when causes are mixed", async () => {
    const { subject, content } = buildUpgradeRequestCreatedEmailCopy(
      await getNotificationI18n("en-US"),
      [
        makeUpgradeRequestCreatedPayload({
          cause: "group_shared_limit",
          groupName: "Sales",
        }),
        makeUpgradeRequestCreatedPayload({
          requesterName: "Grace",
          reason: null,
          cause: "no_seat",
        }),
      ]
    );

    expect(subject).toBe("[Dust] 2 members requested an upgrade");
    expect(content).toContain(
      "• Ada: Sales group budget used up (reason: Big project)"
    );
    expect(content).toContain("• Grace: no seat");
  });
});
