import { describe, expect, it } from "vitest";

import { mentionAgent, replaceMentionsByAt } from "@app/lib/mentions";

describe("mentionAgent", () => {
  it("mentions an agent", () => {
    const res = mentionAgent({ name: "agent", sId: "youpi" });
    expect(res).toBe(":mention[agent]{sId=youpi}");
  });
});

describe("replaceMentionsByAt", () => {
  describe("idempotency with mentionAgent", () => {
    it("should replace mentions", () => {
      const res = replaceMentionsByAt(
        mentionAgent({ name: "agent", sId: "youpi" })
      );
      expect(res).toBe("@agent");
    });

    it("should replace mentions", () => {
      const res = replaceMentionsByAt(
        mentionAgent({ name: "agent", sId: "youpi" }) + " text"
      );
      expect(res).toBe("@agent text");
    });
  });

  describe("mentions", () => {
    it("should replace mentions", () => {
      const res = replaceMentionsByAt(
        ":mention[soupinou]{sId=youpi} :mention[pistache]{sId=youpi2} hello both"
      );
      expect(res).toBe("@soupinou @pistache hello both");
    });

    it("should replace mentions with text", () => {
      const res = replaceMentionsByAt(
        ":mention[soupinou]{sId=youpi} hello :mention[pistache]{sId=youpi2} both"
      );
      expect(res).toBe("@soupinou hello @pistache both");
    });
  });

  describe("non-mentions", () => {
    it("should not extract pure text", () => {
      const res = replaceMentionsByAt("youpi est en vacances");
      expect(res).toBe("youpi est en vacances");
    });

    it("should not extract almost a mention", () => {
      const res = replaceMentionsByAt(":mention[agent]");
      expect(res).toBe(":mention[agent]");
    });
  });
});
