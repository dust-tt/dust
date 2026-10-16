import { makeContentFragments } from "@connectors/api/webhooks/teams/bot";
import {
  getChannelMessage,
  getChannelMessageReplies,
  getMessagesFromConversation,
} from "@connectors/connectors/microsoft/lib/graph_api";
import { getMicrosoftClient } from "@connectors/connectors/microsoft";
import { processFileAttachments } from "@connectors/api/webhooks/teams/content_fragments";
import type { ChatMessage } from "@microsoft/microsoft-graph-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@connectors/connectors/microsoft", () => ({
  getMicrosoftClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@connectors/connectors/microsoft/lib/graph_api", () => ({
  getChannelMessage: vi.fn(),
  getChannelMessageReplies: vi.fn(),
  getMessagesFromConversation: vi.fn(),
}));
vi.mock("@connectors/api/webhooks/teams/content_fragments", () => ({
  processFileAttachments: vi.fn().mockResolvedValue([]),
}));
vi.mock("@connectors/lib/api/config", () => ({
  apiConfig: { getDustFrontAPIUrl: () => "https://front.example.com" },
}));
vi.mock("@connectors/lib/bot/citations", () => ({
  annotateCitations: vi.fn((text: string) => text),
}));
vi.mock("@connectors/lib/bot/conversation_utils", () => ({
  makeConversationUrl: vi.fn(() => "https://dust.example.com/c/123"),
}));
vi.mock("@connectors/lib/bot/mentions", () => ({
  processMessageForMention: vi.fn(),
}));
vi.mock("@connectors/lib/models/microsoft_bot", () => ({
  MicrosoftBotMessageModel: {},
}));
vi.mock("@connectors/types", () => ({
  getHeaderFromUserEmail: vi.fn(() => ({})),
}));
vi.mock("@dust-tt/client", () => ({
  DustAPI: class {},
  Ok: class<T> {
    value: T;
    constructor(value: T) {
      this.value = value;
    }
    isOk() {
      return true;
    }
    isErr() {
      return false;
    }
  },
  Err: class<E> {
    error: E;
    constructor(error: E) {
      this.error = error;
    }
    isOk() {
      return false;
    }
    isErr() {
      return true;
    }
  },
}));
vi.mock("remove-markdown", () => ({ default: (text: string) => text }));
vi.mock("@connectors/api/webhooks/teams/adaptive_cards", () => ({
  createBasicToolApprovalAdaptiveCard: vi.fn(),
  createPersonalAuthenticationAdaptiveCard: vi.fn(),
  createResponseAdaptiveCard: vi.fn(),
  createStreamingAdaptiveCard: vi.fn(),
}));
vi.mock("@connectors/api/webhooks/teams/bot_messaging_utils", () => ({
  updateActivity: vi.fn(),
}));
vi.mock("@connectors/api/webhooks/teams/user_validation", () => ({
  validateTeamsUser: vi.fn(),
}));

function userMessage(
  id: string,
  createdDateTime: string,
  content: string
): ChatMessage {
  return {
    id,
    createdDateTime,
    from: { user: { displayName: `user-${id}` } },
    body: { content },
  };
}

const TEAM_ID = "team-1";
const CHANNEL_ID = "19:chan@thread.tacv2";
const ROOT_ID = "1690271996000";
const THREAD_CONVERSATION_ID = `19:chan@thread.tacv2;messageid=${ROOT_ID}`;

function makeThreadContext(conversationId: string, activityId: string) {
  return {
    activity: {
      id: activityId,
      conversation: { id: conversationId },
      attachments: [],
      channelData: { teamsTeamId: TEAM_ID, teamsChannelId: CHANNEL_ID },
    },
  } as never;
}

function makeDustAPI(uploaded: { content: string | null } = { content: null }) {
  return {
    uploadFile: vi.fn().mockImplementation(({ fileObject }) => {
      uploaded.content = null;
      return fileObject.text().then((text: string) => {
        uploaded.content = text;
        return {
          isOk: () => true,
          isErr: () => false,
          value: { sId: "file-1" },
        };
      });
    }),
  } as never;
}

const logger = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as never;

const connector = { connectionId: "conn-1" } as never;

describe("makeContentFragments - channel thread history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the thread via the channel endpoints and includes the root message", async () => {
    // Graph never returns the root in the replies collection: simulate the
    // documented shape (replies only, oldest first on purpose since ordering
    // must not be relied upon) plus the explicit root fetch.
    vi.mocked(getChannelMessageReplies).mockResolvedValue({
      results: [
        userMessage("r1", "2026-06-17T09:05:00Z", "preferably bilingual"),
        userMessage("current", "2026-06-17T09:10:00Z", "<at>Dust</at> make a staffing plan"),
      ],
    });
    vi.mocked(getChannelMessage).mockResolvedValue(
      userMessage(ROOT_ID, "2026-06-17T09:00:00Z", "We need 3 nurses in Lyon next week")
    );

    const uploaded: { content: string | null } = { content: null };
    const result = await makeContentFragments(
      makeThreadContext(THREAD_CONVERSATION_ID, "current"),
      makeDustAPI(uploaded),
      connector,
      null,
      logger
    );

    expect(vi.mocked(getChannelMessageReplies)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { teamId: TEAM_ID, channelId: CHANNEL_ID, messageId: ROOT_ID, nextLink: undefined }
    );
    expect(vi.mocked(getChannelMessage)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { teamId: TEAM_ID, channelId: CHANNEL_ID, messageId: ROOT_ID }
    );
    expect(vi.mocked(getMessagesFromConversation)).not.toHaveBeenCalled();

    expect(result.isOk()).toBe(true);
    const fragments = (result as { value: { fileId: string }[] }).value;
    expect(fragments).toHaveLength(1);
    // History contains the root message and the reply, but not the current
    // message (sent as the user message itself).
    expect(uploaded.content).toContain("We need 3 nurses in Lyon next week");
    expect(uploaded.content).toContain("preferably bilingual");
    expect(uploaded.content).not.toContain("make a staffing plan");
  });

  it("falls back to the nested team/channel channelData shape", async () => {
    vi.mocked(getChannelMessageReplies).mockResolvedValue({ results: [] });
    vi.mocked(getChannelMessage).mockResolvedValue(
      userMessage(ROOT_ID, "2026-06-17T09:00:00Z", "root content")
    );
    const context = {
      activity: {
        id: "current",
        conversation: { id: THREAD_CONVERSATION_ID },
        attachments: [],
        channelData: { team: { id: TEAM_ID }, channel: { id: CHANNEL_ID } },
      },
    } as never;

    await makeContentFragments(context, makeDustAPI(), connector, null, logger);

    expect(vi.mocked(getChannelMessage)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { teamId: TEAM_ID, channelId: CHANNEL_ID, messageId: ROOT_ID }
    );
  });

  it("still sends the replies when the root message fetch fails", async () => {
    vi.mocked(getChannelMessageReplies).mockResolvedValue({
      results: [
        userMessage("current", "2026-06-17T09:10:00Z", "@Dust plan?"),
        userMessage("r1", "2026-06-17T09:05:00Z", "context reply"),
      ],
    });
    vi.mocked(getChannelMessage).mockRejectedValue(new Error("404"));

    const uploaded: { content: string | null } = { content: null };
    const result = await makeContentFragments(
      makeThreadContext(THREAD_CONVERSATION_ID, "current"),
      makeDustAPI(uploaded),
      connector,
      null,
      logger
    );

    expect(result.isOk()).toBe(true);
    expect(uploaded.content).toContain("context reply");
  });

  it("pages until the current reply is included and keeps the newest messages plus the root", async () => {
    // First page: oldest replies, no current message, has nextLink.
    const oldestPage = Array.from({ length: 50 }, (_, i) =>
      userMessage(`old-${i}`, `2026-06-17T08:${String(i).padStart(2, "0")}:00Z`, `old reply ${i}`)
    );
    const newestPage = [
      userMessage("current", "2026-06-17T10:01:00Z", "@Dust sum this up"),
      userMessage("new-1", "2026-06-17T10:00:00Z", "latest context"),
    ];
    vi.mocked(getChannelMessageReplies)
      .mockResolvedValueOnce({ results: oldestPage, nextLink: "https://graph/next/2" })
      .mockResolvedValueOnce({ results: newestPage });
    vi.mocked(getChannelMessage).mockResolvedValue(
      userMessage(ROOT_ID, "2026-06-17T07:00:00Z", "thread root content")
    );

    const uploaded: { content: string | null } = { content: null };
    const result = await makeContentFragments(
      makeThreadContext(THREAD_CONVERSATION_ID, "current"),
      makeDustAPI(uploaded),
      connector,
      null,
      logger
    );

    expect(result.isOk()).toBe(true);
    const repliesCalls = vi.mocked(getChannelMessageReplies).mock.calls;
    expect(repliesCalls).toHaveLength(2);
    expect(repliesCalls[1][2].nextLink).toBe("https://graph/next/2");
    // The latest reply and the root are both present despite the thread
    // having more than one page of replies.
    expect(uploaded.content).toContain("latest context");
    expect(uploaded.content).toContain("thread root content");
  });

  it("stops paging at the cap and falls back to the root message only when the newest replies are unreachable", async () => {
    // Every page has a nextLink and never contains the current reply: the
    // newest end of the thread cannot be confirmed, so the possibly-stale
    // fetched replies must NOT be passed as recent context.
    vi.mocked(getChannelMessageReplies).mockResolvedValue({
      results: [userMessage("r1", "2026-06-17T09:05:00Z", "possibly stale reply")],
      nextLink: "https://graph/next",
    });
    vi.mocked(getChannelMessage).mockResolvedValue(
      userMessage(ROOT_ID, "2026-06-17T09:00:00Z", "thread root content")
    );

    const uploaded: { content: string | null } = { content: null };
    const result = await makeContentFragments(
      makeThreadContext(THREAD_CONVERSATION_ID, "current"),
      makeDustAPI(uploaded),
      connector,
      null,
      logger
    );

    expect(result.isOk()).toBe(true);
    // Exactly the 4-page cap.
    expect(vi.mocked(getChannelMessageReplies).mock.calls).toHaveLength(4);
    // Root-only fallback: root present, stale replies excluded.
    expect(uploaded.content).toContain("thread root content");
    expect(uploaded.content).not.toContain("possibly stale reply");
  });

  it("keeps the root message when the replies fetch fails entirely", async () => {
    vi.mocked(getChannelMessageReplies).mockRejectedValue(
      new Error("InsufficientPrivileges")
    );
    vi.mocked(getChannelMessage).mockResolvedValue(
      userMessage(ROOT_ID, "2026-06-17T09:00:00Z", "thread root content")
    );

    const uploaded: { content: string | null } = { content: null };
    const result = await makeContentFragments(
      makeThreadContext(THREAD_CONVERSATION_ID, "current"),
      makeDustAPI(uploaded),
      connector,
      null,
      logger
    );

    expect(result.isOk()).toBe(true);
    expect(uploaded.content).toContain("thread root content");
  });

  it("uses the newest messages when the last page is reached without the current reply", async () => {
    // Graph eventual consistency: the current reply is missing but there is
    // no next page, so the fetched set is the whole thread and sorting gives
    // the true newest messages.
    vi.mocked(getChannelMessageReplies).mockResolvedValue({
      results: [
        userMessage("r2", "2026-06-17T09:05:00Z", "newest available reply"),
        userMessage("r1", "2026-06-17T09:01:00Z", "older reply"),
      ],
    });
    vi.mocked(getChannelMessage).mockResolvedValue(
      userMessage(ROOT_ID, "2026-06-17T09:00:00Z", "thread root content")
    );

    const uploaded: { content: string | null } = { content: null };
    const result = await makeContentFragments(
      makeThreadContext(THREAD_CONVERSATION_ID, "current"),
      makeDustAPI(uploaded),
      connector,
      null,
      logger
    );

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(getChannelMessageReplies).mock.calls).toHaveLength(1);
    expect(uploaded.content).toContain("newest available reply");
    expect(uploaded.content).toContain("older reply");
    expect(uploaded.content).toContain("thread root content");
  });

  it("keeps the whole page when the last bot reply is not in it", async () => {
    vi.mocked(getChannelMessageReplies).mockResolvedValue({
      results: [
        userMessage("current", "2026-06-17T09:20:00Z", "@Dust and now?"),
        userMessage("r2", "2026-06-17T09:15:00Z", "new context"),
        userMessage("r1", "2026-06-17T09:05:00Z", "stale context"),
      ],
    });
    vi.mocked(getChannelMessage).mockResolvedValue(
      userMessage(ROOT_ID, "2026-06-17T09:00:00Z", "thread root content")
    );

    const uploaded: { content: string | null } = { content: null };
    await makeContentFragments(
      makeThreadContext(THREAD_CONVERSATION_ID, "current"),
      makeDustAPI(uploaded),
      connector,
      { agentActivityId: "bot-msg-1", conversationId: "dust-conv-1" } as never,
      logger
    );

    // No bot reply in the page: everything fetched is kept.
    expect(uploaded.content).toContain("new context");
    expect(uploaded.content).toContain("stale context");
    expect(uploaded.content).toContain("thread root content");
  });

  it("uses the chat endpoint and attaches no first-mention history outside threads", async () => {
    vi.mocked(getMessagesFromConversation).mockResolvedValue({
      results: [
        userMessage("current", "2026-06-17T09:10:00Z", "@Dust hi"),
        userMessage("older", "2026-06-17T09:00:00Z", "earlier chat message"),
      ],
    });

    const uploaded: { content: string | null } = { content: null };
    const result = await makeContentFragments(
      makeThreadContext("19:group@thread.v2", "current"),
      makeDustAPI(uploaded),
      connector,
      null,
      logger
    );

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(getMessagesFromConversation)).toHaveBeenCalled();
    expect(vi.mocked(getChannelMessageReplies)).not.toHaveBeenCalled();
    expect(vi.mocked(getChannelMessage)).not.toHaveBeenCalled();
    // Existing behavior preserved: a first mention in a chat attaches an
    // empty history fragment.
    expect(uploaded.content).toBe("");
  });

  it("keeps the graceful fallback when both thread fetches fail", async () => {
    vi.mocked(getChannelMessageReplies).mockRejectedValue(
      new Error("InsufficientPrivileges")
    );
    vi.mocked(getChannelMessage).mockResolvedValue(null as never);

    const result = await makeContentFragments(
      makeThreadContext(THREAD_CONVERSATION_ID, "current"),
      makeDustAPI(),
      connector,
      null,
      logger
    );

    expect(result.isOk()).toBe(true);
    expect((result as { value: unknown }).value).toBeUndefined();
  });
});
