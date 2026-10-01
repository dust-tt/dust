import { renderEmail } from "@app/lib/notifications/email-templates/agent-message-feedback-digest";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import {
  buildAgentMessageFeedbackDigestSubject,
  buildAgentMessageFeedbackInAppCopy,
} from "@app/lib/notifications/workflows/agent-message-feedback";
import { describe, expect, it } from "vitest";

const FEEDBACK = {
  agentName: "Helper",
  userWhoGaveFeedbackFullName: "Ada Lovelace",
  thumbDirection: "up" as const,
};

describe("agent message feedback copy", () => {
  it("renders the in-app copy in English and French", async () => {
    const en = buildAgentMessageFeedbackInAppCopy(
      await getNotificationI18n("en-US"),
      FEEDBACK
    );
    const fr = buildAgentMessageFeedbackInAppCopy(
      await getNotificationI18n("fr-FR"),
      FEEDBACK
    );

    expect(en.body).toBe("Ada Lovelace left a positive feedback on Helper.");
    expect(fr.subject).toBe("Nouveau retour sur Helper");
  });

  it("pluralizes the digest subject", async () => {
    const counts = { feedbackCount: 1, positiveCount: 1, negativeCount: 0 };

    expect(
      buildAgentMessageFeedbackDigestSubject(
        await getNotificationI18n("en-US"),
        counts
      )
    ).toBe("[Dust] 1 feedback on your agents (👍 1 - 👎 0)");
    expect(
      buildAgentMessageFeedbackDigestSubject(
        await getNotificationI18n("fr-FR"),
        { ...counts, feedbackCount: 2, negativeCount: 1 }
      )
    ).toBe("[Dust] 2 retours sur vos agents (👍 1 - 👎 1)");
  });

  it("renders the digest email in French", async () => {
    const html = await renderEmail({
      i18n: await getNotificationI18n("fr-FR"),
      name: "Grace",
      workspace: { id: "w_1", name: "Acme" },
      feedbacks: [{ ...FEEDBACK, feedbackContent: "Great" }],
    });

    expect(html).toContain(
      "Vous avez reçu 1 retour sur vos agents aujourd’hui"
    );
    expect(html).toContain("par Ada Lovelace");
  });
});
