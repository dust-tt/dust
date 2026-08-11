import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Slack WebClient
const mockUsersInfo = vi.fn();
const mockAuthTest = vi.fn();
const mockConversationsInfo = vi.fn();
const mockConversationsReplies = vi.fn();

vi.mock("@slack/web-api", () => {
  return {
    WebClient: class MockWebClient {
      users = {
        info: mockUsersInfo,
      };
      auth = {
        test: mockAuthTest,
      };
      conversations = {
        info: mockConversationsInfo,
        replies: mockConversationsReplies,
      };
    },
  };
});

// Bypass Redis caching so users.info mocks are exercised deterministically.
vi.mock(import("@app/lib/utils/cache"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cacheWithRedis: ((fn: unknown) => fn) as typeof actual.cacheWithRedis,
  };
});

// Import after mocking
import {
  executeReadThreadMessages,
  extractMentionedSlackUserIds,
  resolveUserDisplayNames,
} from "@app/lib/api/actions/servers/slack/helpers";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractMentionedSlackUserIds", () => {
  it("extracts raw mention syntax", () => {
    expect(
      extractMentionedSlackUserIds("Hey <@U050CALAKFD> can you review?")
    ).toEqual(["U050CALAKFD"]);
  });

  it("extracts raw mention syntax with a username part", () => {
    expect(extractMentionedSlackUserIds("cc <@U050CALAKFD|jane>")).toEqual([
      "U050CALAKFD",
    ]);
  });

  it("extracts rendered mentions", () => {
    expect(extractMentionedSlackUserIds("Hey @U050CALAKFD ping")).toEqual([
      "U050CALAKFD",
    ]);
  });

  it("extracts enterprise-grid (W-prefixed) user IDs", () => {
    expect(extractMentionedSlackUserIds("ping <@W012345678>")).toEqual([
      "W012345678",
    ]);
  });

  it("deduplicates IDs across mention forms", () => {
    expect(
      extractMentionedSlackUserIds("<@U050CALAKFD> and @U050CALAKFD again")
    ).toEqual(["U050CALAKFD"]);
  });

  it("ignores emails and regular words", () => {
    expect(
      extractMentionedSlackUserIds(
        "mail me at foo@U12345678X.com or say @Update please"
      )
    ).toEqual([]);
  });

  it("returns an empty array when there is no mention", () => {
    expect(extractMentionedSlackUserIds("no mention here")).toEqual([]);
  });
});

describe("resolveUserDisplayNames", () => {
  const testConfig = {
    accessToken: "xoxp-test-token",
    mcpServerId: "test-server-123",
  };

  it("resolves display names in bulk and dedupes user IDs", async () => {
    mockUsersInfo.mockImplementation(({ user }: { user: string }) =>
      Promise.resolve({
        ok: true,
        user: {
          id: user,
          profile: { display_name: `name-${user}` },
        },
      })
    );

    const displayNamesByUserId = await resolveUserDisplayNames({
      userIds: ["U01", "U02", "U01"],
      ...testConfig,
    });

    expect(mockUsersInfo).toHaveBeenCalledTimes(2);
    expect(displayNamesByUserId.get("U01")).toBe("name-U01");
    expect(displayNamesByUserId.get("U02")).toBe("name-U02");
  });

  it("omits unresolvable user IDs", async () => {
    mockUsersInfo.mockImplementation(({ user }: { user: string }) => {
      if (user === "U404") {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({
        ok: true,
        user: { id: user, real_name: "Jane Doe" },
      });
    });

    const displayNamesByUserId = await resolveUserDisplayNames({
      userIds: ["U01", "U404"],
      ...testConfig,
    });

    expect(displayNamesByUserId.get("U01")).toBe("Jane Doe");
    expect(displayNamesByUserId.has("U404")).toBe(false);
  });
});

describe("executeReadThreadMessages permalinks", () => {
  it("adds per-message permalinks when the team URL is resolvable", async () => {
    mockConversationsInfo.mockResolvedValue({
      ok: true,
      channel: { id: "C012AB3CD", name: "general" },
    });
    mockAuthTest.mockResolvedValue({
      ok: true,
      url: "https://acme.slack.com/",
    });
    mockConversationsReplies.mockResolvedValue({
      ok: true,
      messages: [
        {
          text: "parent",
          user: "U01",
          ts: "1234567890.123456",
          reply_count: 1,
        },
        { text: "reply", user: "U02", ts: "1234567891.000200" },
      ],
      has_more: false,
    });

    const result = await executeReadThreadMessages({
      channel: "C012AB3CD",
      threadTs: "1234567890.123456",
      limit: undefined,
      cursor: undefined,
      oldest: undefined,
      latest: undefined,
      accessToken: "xoxp-test-token",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const payload = JSON.parse(result.value[1].text);
      expect(payload.parent_message.permalink).toBe(
        "https://acme.slack.com/archives/C012AB3CD/p1234567890123456"
      );
      expect(payload.thread_replies[0].permalink).toBe(
        "https://acme.slack.com/archives/C012AB3CD/p1234567891000200?thread_ts=1234567890.123456&cid=C012AB3CD"
      );
    }
  });

  it("omits permalinks when the team URL cannot be resolved", async () => {
    mockConversationsInfo.mockResolvedValue({
      ok: true,
      channel: { id: "C012AB3CD", name: "general" },
    });
    mockAuthTest.mockRejectedValue(new Error("invalid_auth"));
    mockConversationsReplies.mockResolvedValue({
      ok: true,
      messages: [
        {
          text: "parent",
          user: "U01",
          ts: "1234567890.123456",
          reply_count: 0,
        },
      ],
      has_more: false,
    });

    const result = await executeReadThreadMessages({
      channel: "C012AB3CD",
      threadTs: "1234567890.123456",
      limit: undefined,
      cursor: undefined,
      oldest: undefined,
      latest: undefined,
      accessToken: "xoxp-test-token",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const payload = JSON.parse(result.value[1].text);
      expect(payload.parent_message.permalink).toBeUndefined();
    }
  });
});
