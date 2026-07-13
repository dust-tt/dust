import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetBotOrUserName, mockGetUserInfo } = vi.hoisted(() => ({
  mockGetBotOrUserName: vi.fn(),
  mockGetUserInfo: vi.fn(),
}));

vi.mock("@connectors/connectors/slack/lib/bot_user_helpers", () => ({
  getBotOrUserName: mockGetBotOrUserName,
  getUserInfo: mockGetUserInfo,
}));

// Keep everything real except `renderDocumentTitleAndContent`, which tokenizes
// the title over the network. Stub it to return the section tree it is handed,
// so we can assert on the content we assembled with `sectionFullText`.
vi.mock("@connectors/lib/data_sources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@connectors/lib/data_sources")>();
  return {
    ...actual,
    renderDocumentTitleAndContent: vi.fn(
      async ({
        content,
      }: {
        content: CoreAPIDataSourceDocumentSection | null;
      }) => content ?? { prefix: null, content: null, sections: [] }
    ),
  };
});

import { sectionFullText } from "@connectors/lib/data_sources";

import { formatMessagesForUpsert } from "./messages";

function upsert(messages: MessageElement[]) {
  return formatMessagesForUpsert({
    dataSourceConfig: {} as DataSourceConfig,
    channelName: "alerts",
    messages,
    isThread: true,
    connectorId: 1 as ModelId,
    slackClient: {} as WebClient,
  });
}

describe("formatMessagesForUpsert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBotOrUserName.mockResolvedValue("grafana");
    mockGetUserInfo.mockResolvedValue({ name: "bob", email: null });
  });

  it("reconstructs a block-only bot alert whose top-level text is empty", async () => {
    // Grafana-style alert: empty `text`, content lives in Block Kit blocks.
    const message = {
      type: "message",
      bot_id: "B123",
      ts: "1720000000.000100",
      text: "",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "[FIRING][P2] tax-service - final v2 temporary test alert",
          },
        },
        { type: "section", text: { type: "mrkdwn", text: "*Summary*" } },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "- tax-service - final v2 temporary test alert",
          },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "View" },
            url: "https://grafana.example/alert/123",
          },
        },
        { type: "section", text: { type: "mrkdwn", text: "*Details*" } },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Grafana vmain-5f542a7 | Added by grafana",
            },
          ],
        },
      ],
    } as MessageElement;

    const result = await upsert([message]);
    const text = sectionFullText(result);

    expect(text).toContain(
      "[FIRING][P2] tax-service - final v2 temporary test alert"
    );
    expect(text).toContain("Summary");
    expect(text).toContain("Details");
    expect(text).toContain("View (https://grafana.example/alert/123)");
    expect(text).toContain(">> @grafana");
    // The body must not be the empty-section placeholder.
    expect(text).not.toContain("(empty)");
  });

  it("renders a forwarded (unfurl) attachment once, without duplication", async () => {
    const message = {
      type: "message",
      user: "U123",
      ts: "1720000000.000200",
      text: "see the alert below",
      attachments: [
        {
          is_msg_unfurl: true,
          author_name: "alice",
          text: "deploy of tax-service failed at 09:00",
          fallback: "deploy failed",
        },
      ],
    } as MessageElement;

    const result = await upsert([message]);
    const text = sectionFullText(result);

    expect(text).toContain("Forwarded from @alice:");
    expect(text).toContain("deploy of tax-service failed at 09:00");
    // The unfurl attachment is rendered only by the forwarded path, not also
    // by the formatter (which is fed the non-unfurl attachments only).
    const occurrences = text.match(/deploy of tax-service failed at 09:00/g);
    expect(occurrences).toHaveLength(1);
  });

  it("indexes a plain text message unchanged", async () => {
    const message = {
      type: "message",
      user: "U1",
      ts: "1720000000.000300",
      text: "the deploy is done",
    } as MessageElement;

    const text = sectionFullText(await upsert([message]));

    expect(text).toContain(">> @bob");
    expect(text).toContain("the deploy is done");
    expect(text).not.toContain("(empty)");
  });

  it("keeps both the top-level text and the block content", async () => {
    const message = {
      type: "message",
      bot_id: "B1",
      ts: "1720000000.000400",
      text: "top level summary",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "block detail line" },
        },
      ],
    } as MessageElement;

    const text = sectionFullText(await upsert([message]));

    expect(text).toContain("top level summary");
    expect(text).toContain("block detail line");
  });
});
