import { describe, expect, it } from "vitest";

import type { RichMention } from "@app/types";

import {
  AGENT_MENTION_REGEX,
  replaceMentionsWithAt,
  serializeMention,
  USER_MENTION_REGEX,
} from "./format";

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
        "Hello :mention[John Doe]{sId=user_123}, how are you?"
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
        "Hello :mention_user[John Doe]{sId=user_123}, how are you?"
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

  describe("regex", () => {
    describe("agent mentions", () => {
      it("matches a single agent mention and captures name and sId", () => {
        const text = ":mention[Agent Zero]{sId=agent_123}";
        const matches = [...text.matchAll(AGENT_MENTION_REGEX)];
        expect(matches.length).toBe(1);
        const m = matches[0];
        expect(m[0]).toBe(":mention[Agent Zero]{sId=agent_123}");
        expect(m[1]).toBe("Agent Zero");
        expect(m[2]).toBe("agent_123");
      });

      it("matches multiple agent mentions in a sentence", () => {
        const text =
          "Hello :mention[John Doe]{sId=a1} and :mention[Jane-Doe Jr.]{sId=a2}!";
        const matches = [...text.matchAll(AGENT_MENTION_REGEX)];
        expect(matches.length).toBe(2);
        expect(matches[0][1]).toBe("John Doe");
        expect(matches[0][2]).toBe("a1");
        expect(matches[1][1]).toBe("Jane-Doe Jr.");
        expect(matches[1][2]).toBe("a2");
      });

      it("does not match malformed or user mentions", () => {
        const malformed1 = ":mention[NoSid]{id=abc}"; // wrong key
        const malformed2 = ":mention[Missing end brace]{sId=abc"; // missing }
        const userMention = ":mention_user[John]{sId=u1}"; // different token
        expect([...malformed1.matchAll(AGENT_MENTION_REGEX)].length).toBe(0);
        expect([...malformed2.matchAll(AGENT_MENTION_REGEX)].length).toBe(0);
        expect([...userMention.matchAll(AGENT_MENTION_REGEX)].length).toBe(0);
      });
    });

    describe("user mentions", () => {
      it("matches a single user mention and captures name and sId", () => {
        const text = ":mention_user[Super User]{sId=user_999}";
        const matches = [...text.matchAll(USER_MENTION_REGEX)];
        expect(matches.length).toBe(1);
        const m = matches[0];
        expect(m[0]).toBe(":mention_user[Super User]{sId=user_999}");
        expect(m[1]).toBe("Super User");
        expect(m[2]).toBe("user_999");
      });

      it("matches multiple user mentions in text", () => {
        const text =
          "Ping :mention_user[Alice B.]{sId=u1} and :mention_user[Bob]{sId=u2}.";
        const matches = [...text.matchAll(USER_MENTION_REGEX)];
        expect(matches.length).toBe(2);
        expect(matches[0][1]).toBe("Alice B.");
        expect(matches[0][2]).toBe("u1");
        expect(matches[1][1]).toBe("Bob");
        expect(matches[1][2]).toBe("u2");
      });

      it("does not match malformed or agent mentions", () => {
        const malformed1 = ":mention_user[NoSid]{id=abc}"; // wrong key
        const malformed2 = ":mention_user[Missing end brace]{sId=abc"; // missing }
        const agentMention = ":mention[Agent]{sId=a1}"; // different token
        expect([...malformed1.matchAll(USER_MENTION_REGEX)].length).toBe(0);
        expect([...malformed2.matchAll(USER_MENTION_REGEX)].length).toBe(0);
        expect([...agentMention.matchAll(USER_MENTION_REGEX)].length).toBe(0);
      });
    });
  });
});
