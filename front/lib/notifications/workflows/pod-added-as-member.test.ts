import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { buildPodAddedAsMemberCopy } from "@app/lib/notifications/workflows/pod-added-as-member";
import { describe, expect, it } from "vitest";

const DETAILS = {
  podName: "Roadmap",
  userThatAddedYouFullname: "Ada Lovelace",
  workspaceName: "Acme",
};

describe("buildPodAddedAsMemberCopy", () => {
  it("renders the copy in English", async () => {
    const { emailSubject, content } = buildPodAddedAsMemberCopy(
      await getNotificationI18n("en-US"),
      DETAILS
    );

    expect(emailSubject).toBe('[Dust] You were added to Pod "Roadmap"');
    expect(content).toBe('Ada Lovelace added you to Pod "Roadmap".');
  });

  it("renders the copy in French", async () => {
    const { content } = buildPodAddedAsMemberCopy(
      await getNotificationI18n("fr-FR"),
      DETAILS
    );

    expect(content).toBe("Ada Lovelace vous a ajouté au Pod « Roadmap ».");
  });
});
