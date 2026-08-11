import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Slack WebClient
const mockAuthTest = vi.fn();

vi.mock("@slack/web-api", () => {
  return {
    WebClient: class MockWebClient {
      auth = {
        test: mockAuthTest,
      };
    },
  };
});

// Import after mocking
import {
  buildSlackPermalink,
  getSlackTeamUrl,
} from "@app/lib/api/actions/servers/slack/helpers";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildSlackPermalink", () => {
  it("builds an archive permalink from channel id and message ts", () => {
    expect(
      buildSlackPermalink({
        teamUrl: "https://acme.slack.com/",
        channelId: "C012AB3CD",
        messageTs: "1234567890.123456",
      })
    ).toBe("https://acme.slack.com/archives/C012AB3CD/p1234567890123456");
  });

  it("handles a team URL without a trailing slash", () => {
    expect(
      buildSlackPermalink({
        teamUrl: "https://acme.slack.com",
        channelId: "C012AB3CD",
        messageTs: "1234567890.123456",
      })
    ).toBe("https://acme.slack.com/archives/C012AB3CD/p1234567890123456");
  });
});

describe("getSlackTeamUrl", () => {
  it("returns the team URL from auth.test", async () => {
    mockAuthTest.mockResolvedValue({
      ok: true,
      url: "https://acme.slack.com/",
    });

    const teamUrl = await getSlackTeamUrl({ accessToken: "xoxp-test-token" });

    expect(teamUrl).toBe("https://acme.slack.com/");
  });

  it("returns null when auth.test does not return a URL", async () => {
    mockAuthTest.mockResolvedValue({ ok: true });

    const teamUrl = await getSlackTeamUrl({ accessToken: "xoxp-test-token" });

    expect(teamUrl).toBeNull();
  });

  it("returns null when auth.test fails", async () => {
    mockAuthTest.mockRejectedValue(new Error("invalid_auth"));

    const teamUrl = await getSlackTeamUrl({ accessToken: "xoxp-test-token" });

    expect(teamUrl).toBeNull();
  });
});
