import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { buildAgentSuggestionsReadyInAppCopy } from "@app/lib/notifications/workflows/agent-suggestions-ready";
import { describe, expect, it } from "vitest";

describe("buildAgentSuggestionsReadyInAppCopy", () => {
  it("pluralizes the body in English", async () => {
    const i18n = await getNotificationI18n("en-US");

    expect(buildAgentSuggestionsReadyInAppCopy(i18n, 1).body).toBe(
      "1 new improvement suggestion ready for review."
    );
    expect(buildAgentSuggestionsReadyInAppCopy(i18n, 3).body).toBe(
      "3 new improvement suggestions ready for review."
    );
  });

  it("renders the copy in French", async () => {
    const { body, actionLabel } = buildAgentSuggestionsReadyInAppCopy(
      await getNotificationI18n("fr-FR"),
      3
    );

    expect(body).toBe(
      "3 nouvelles suggestions d’amélioration prêtes à être examinées."
    );
    expect(actionLabel).toBe("Examiner");
  });
});
