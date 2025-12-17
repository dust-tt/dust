import { describe, expect, it } from "vitest";

import type { RichMention } from "@app/types";

import {
  AGENT_MENTION_REGEX,
  extractFromString,
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

describe("extractFromString", () => {
  describe("agent mentions", () => {
    it("extracts a single agent mention", () => {
      const content = ":mention[Agent Zero]{sId=agent_123}";
      const result = extractFromString(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ configurationId: "agent_123" });
    });

    it("extracts multiple agent mentions", () => {
      const content =
        "Hello :mention[John Doe]{sId=a1} and :mention[Jane-Doe Jr.]{sId=a2}!";
      const result = extractFromString(content);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ configurationId: "a1" });
      expect(result[1]).toEqual({ configurationId: "a2" });
    });

    it("extracts agent mentions with special characters in name", () => {
      const content = ":mention[Agent-Name_123]{sId=agent_456}";
      const result = extractFromString(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ configurationId: "agent_456" });
    });

    it("extracts agent mentions with special characters in configurationId", () => {
      const content = ":mention[Agent]{sId=agent-123_456}";
      const result = extractFromString(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ configurationId: "agent-123_456" });
    });

    it("extracts agent mentions interspersed with text", () => {
      const content =
        "Start :mention[First]{sId=id1} middle :mention[Second]{sId=id2} end";
      const result = extractFromString(content);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ configurationId: "id1" });
      expect(result[1]).toEqual({ configurationId: "id2" });
    });
  });

  describe("user mentions", () => {
    it("extracts a single user mention", () => {
      const content = ":mention_user[Super User]{sId=user_999}";
      const result = extractFromString(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: "user", userId: "user_999" });
    });

    it("extracts multiple user mentions", () => {
      const content =
        "Ping :mention_user[Alice B.]{sId=u1} and :mention_user[Bob]{sId=u2}.";
      const result = extractFromString(content);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: "user", userId: "u1" });
      expect(result[1]).toEqual({ type: "user", userId: "u2" });
    });

    it("extracts user mentions with special characters in name", () => {
      const content = ":mention_user[User-Name_123]{sId=user_456}";
      const result = extractFromString(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: "user", userId: "user_456" });
    });

    it("extracts user mentions with special characters in userId", () => {
      const content = ":mention_user[User]{sId=user-123_456}";
      const result = extractFromString(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: "user", userId: "user-123_456" });
    });
  });

  describe("mixed mentions", () => {
    it("extracts both agent and user mentions", () => {
      const content =
        ":mention_user[Alice]{sId=u1} hello :mention[Agent]{sId=a1} both";
      const result = extractFromString(content);
      expect(result).toHaveLength(2);
      // Agent mentions come first, then user mentions
      expect(result[0]).toEqual({ configurationId: "a1" });
      expect(result[1]).toEqual({ type: "user", userId: "u1" });
    });

    it("extracts multiple agent and user mentions", () => {
      const content =
        ":mention[Agent1]{sId=a1} :mention_user[User1]{sId=u1} :mention[Agent2]{sId=a2} :mention_user[User2]{sId=u2}";
      const result = extractFromString(content);
      expect(result).toHaveLength(4);
      // All agent mentions come first, then all user mentions
      expect(result[0]).toEqual({ configurationId: "a1" });
      expect(result[1]).toEqual({ configurationId: "a2" });
      expect(result[2]).toEqual({ type: "user", userId: "u1" });
      expect(result[3]).toEqual({ type: "user", userId: "u2" });
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty string", () => {
      const result = extractFromString("");
      expect(result).toEqual([]);
    });

    it("returns empty array for text without mentions", () => {
      const result = extractFromString("This is just plain text");
      expect(result).toEqual([]);
    });

    it("ignores malformed agent mentions", () => {
      const content =
        ":mention[NoSid]{id=abc} :mention[Missing end brace]{sId=abc";
      const result = extractFromString(content);
      expect(result).toEqual([]);
    });

    it("ignores malformed user mentions", () => {
      const content =
        ":mention_user[NoSid]{id=abc} :mention_user[Missing end brace]{sId=abc";
      const result = extractFromString(content);
      expect(result).toEqual([]);
    });

    it("extracts valid mentions and ignores malformed ones", () => {
      const content =
        ":mention[Valid]{sId=valid1} :mention[Invalid]{id=invalid} :mention_user[ValidUser]{sId=valid2}";
      const result = extractFromString(content);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ configurationId: "valid1" });
      expect(result[1]).toEqual({ type: "user", userId: "valid2" });
    });

    it("does not match mentions with empty name", () => {
      const content = ":mention[]{sId=agent_123}";
      const result = extractFromString(content);
      // Regex requires at least one character in name, so empty name won't match
      expect(result).toEqual([]);
    });

    it("does not match mentions with empty sId", () => {
      const content = ":mention[Agent]{sId=}";
      const result = extractFromString(content);
      // Regex requires at least one character in sId, so empty sId won't match
      expect(result).toEqual([]);
    });

    it("handles newlines and whitespace around mentions", () => {
      const content =
        "\n  :mention[Agent]{sId=a1}  \n  :mention_user[User]{sId=u1}  \n";
      const result = extractFromString(content);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ configurationId: "a1" });
      expect(result[1]).toEqual({ type: "user", userId: "u1" });
    });
  });
});
