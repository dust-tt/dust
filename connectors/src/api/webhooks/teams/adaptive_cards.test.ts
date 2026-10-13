import { getBotI18n } from "@connectors/lib/bot/i18n";
import { describe, expect, it, vi } from "vitest";

vi.mock("@connectors/lib/bot/conversation_utils", () => ({
  makeDustAppUrl: (path: string) => `https://dust.tt${path}`,
}));

import { createErrorAdaptiveCard } from "./adaptive_cards";

describe("createErrorAdaptiveCard", () => {
  // The instance is not named `i18n`: `lingui extract` would collect test messages otherwise.
  it("renders the footer in the given locale", async () => {
    const fr = await getBotI18n("fr-FR");
    const card = createErrorAdaptiveCard({
      i18n: fr,
      error: "boom",
      workspaceId: "w1",
      conversationUrl: "https://dust.tt/w/w1/conversation/c1",
    });

    const serialized = JSON.stringify(card);
    expect(serialized).toContain("❌ boom");
    expect(serialized).toContain(
      "[Voir toute la conversation](https://dust.tt/w/w1/conversation/c1)"
    );
    expect(serialized).toContain(
      "[Parcourir les agents](https://dust.tt/w/w1/agent/new)"
    );
    expect(serialized).toContain("[En savoir plus](https://dust.tt/home)");
  });
});
