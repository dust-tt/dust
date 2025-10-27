import { describe, expect, it } from "vitest";

import { replaceMentionsWithAt, serializeMention } from "./format";

describe("serializeMention", () => {
  it("mentions an agent", () => {
    const res = serializeMention({ name: "agent", sId: "youpi" });
    expect(res).toBe(":mention[agent]{sId=youpi}");
  });
});

describe("replaceMentionsWithAt", () => {
  describe("idempotency with serializeMention", () => {
    it("should replace mentions", () => {
      const res = replaceMentionsWithAt(
        serializeMention({ name: "agent", sId: "youpi" })
      );
      expect(res).toBe("@agent");
    });

    it("should replace mentions", () => {
      const res = replaceMentionsWithAt(
        serializeMention({ name: "agent", sId: "youpi" }) + " text"
      );
      expect(res).toBe("@agent text");
    });
  });

  describe("mentions", () => {
    it("should replace mentions", () => {
      const res = replaceMentionsWithAt(
        ":mention[soupinou]{sId=youpi} :mention[pistache]{sId=youpi2} hello both"
      );
      expect(res).toBe("@soupinou @pistache hello both");
    });

    it("should replace mentions with text", () => {
      const res = replaceMentionsWithAt(
        ":mention[soupinou]{sId=youpi} hello :mention[pistache]{sId=youpi2} both"
      );
      expect(res).toBe("@soupinou hello @pistache both");
    });

    it("should replace mentions with spaces", () => {
      const res = replaceMentionsWithAt(
        "Hello :mention[John Doe]{user_123}, how are you?"
      );
      expect(res).toBe("Hello @John Doe, how are you?");
    });
  });

  describe("non-mentions", () => {
    it("should not extract pure text", () => {
      const res = replaceMentionsWithAt("youpi est en vacances");
      expect(res).toBe("youpi est en vacances");
    });

    it("should not extract almost a mention", () => {
      const res = replaceMentionsWithAt(":mention[agent]");
      expect(res).toBe(":mention[agent]");
    });
  });
});
