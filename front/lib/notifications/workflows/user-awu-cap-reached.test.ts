import { getNotificationI18n } from "@app/lib/notifications/i18n";
import {
  buildUserAwuCapReachedEmailCopy,
  buildUserAwuCapReachedInAppCopy,
} from "@app/lib/notifications/workflows/user-awu-cap-reached";
import { describe, expect, it } from "vitest";

const PAYLOAD = {
  workspaceId: "w_1",
  workspaceName: "Acme",
  capAwuCredits: 100,
  isBlocked: true,
};

describe("user AWU cap reached copy", () => {
  it("renders the email in English", async () => {
    const { subject } = buildUserAwuCapReachedEmailCopy(
      await getNotificationI18n("en-US"),
      PAYLOAD
    );

    expect(subject).toBe("[Dust] You've reached your usage limit in Acme");
  });

  it("renders the in-app notification in French", async () => {
    const { subject } = buildUserAwuCapReachedInAppCopy(
      await getNotificationI18n("fr-FR"),
      { ...PAYLOAD, isBlocked: false }
    );

    expect(subject).toBe(
      "Vous avez utilisé 80 % de votre limite d’utilisation"
    );
  });
});
