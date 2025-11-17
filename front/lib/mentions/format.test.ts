import { describe, expect, it } from "vitest";

import type { RichMention } from "@app/types";

import { replaceMentionsWithAt, serializeMention } from "./format";

const agentMention = {
  type: "agent",
  id: "youpi",
  label: "wonderful agent",
  pictureUrl: "",
  description: "",
} satisfies RichMention;

const userMention = {
  type: "user",
  id: "youpi",
  label: "super user",
  pictureUrl: "",
  description: "",
} satisfies RichMention;

describe("serializeMention", () => {
  it("mentions an agent [deprecated]", () => {
    const res = serializeMention({ name: "agent", sId: "youpi" });
    expect(res).toBe(":mention[agent]{sId=youpi}");
  });

  it("mentions an agent", () => {
    const res = serializeMention(agentMention);
    expect(res).toBe(":mention[wonderful agent]{sId=youpi}");
  });

  it("mentions a user", () => {
    const res = serializeMention(userMention);
    expect(res).toBe(":mention_user[super user]{sId=youpi}");
  });
});

describe("replaceMentionsWithAt", () => {
  describe("idempotency with serializeMention", () => {
    it("should replace mentions", () => {
      const res = replaceMentionsWithAt(serializeMention(agentMention));
      expect(res).toBe("@wonderful agent");
    });

    it("should replace mentions", () => {
      const res = replaceMentionsWithAt(
        serializeMention(agentMention) + " text"
      );
      expect(res).toBe("@wonderful agent text");
    });
  });

  describe("mentions", () => {
    it("should replace mentions of agent", () => {
      const res = replaceMentionsWithAt(
        ":mention[soupinou]{sId=youpi} :mention[pistache]{sId=youpi2} hello both"
      );
      expect(res).toBe("@soupinou @pistache hello both");
    });

    it("should replace mentions with text of agent", () => {
      const res = replaceMentionsWithAt(
        ":mention[soupinou]{sId=youpi} hello :mention[pistache]{sId=youpi2} both"
      );
      expect(res).toBe("@soupinou hello @pistache both");
    });

    it("should replace mentions with spaces of agent", () => {
      const res = replaceMentionsWithAt(
        "Hello :mention[John Doe]{user_123}, how are you?"
      );
      expect(res).toBe("Hello @John Doe, how are you?");
    });

    it("should replace mentions of user", () => {
      const res = replaceMentionsWithAt(":mention_user[soupinou]{sId=youpi}");
      expect(res).toBe("@soupinou");
    });

    it("should replace mentions of user and agent", () => {
      const res = replaceMentionsWithAt(
        ":mention_user[soupinou]{sId=youpi} hello :mention[pistache]{sId=youpi2} both"
      );
      expect(res).toBe("@soupinou hello @pistache both");
    });

    it("should replace mentions with spaces of user", () => {
      const res = replaceMentionsWithAt(
        "Hello :mention_user[John Doe]{user_123}, how are you?"
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
