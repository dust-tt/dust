import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetBotOrUserName, mockGetUserInfo, mockGetChannelNameById } =
  vi.hoisted(() => ({
    mockGetBotOrUserName: vi.fn(),
    mockGetUserInfo: vi.fn(),
    mockGetChannelNameById: vi.fn(),
  }));

vi.mock("@connectors/connectors/slack/lib/bot_user_helpers", () => ({
  getBotOrUserName: mockGetBotOrUserName,
  getUserInfo: mockGetUserInfo,
}));

vi.mock("@connectors/connectors/slack/lib/channels", () => ({
  getChannelNameById: mockGetChannelNameById,
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
    dataSourceConfig: {
      workspaceAPIKey: "test",
      workspaceId: "test",
      dataSourceId: "test",
    },
    channelName: "alerts",
    messages,
    isThread: true,
    connectorId: 1,
    // getUserInfo/getBotOrUserName are mocked, so the client is never used; it is
    // only a placeholder for the (large, external) WebClient type.
    slackClient: {} as WebClient,
  });
}

interface SlackMessageFixture {
  type?: "message";
  user?: string;
  bot_id?: string;
  ts?: string;
  text?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  files?: unknown[];
}

// Build fixtures through this factory so the single cast lives here, not at every
// call site. `MessageElement` is a generated Slack response type whose block and
// attachment element types are narrower than real payloads (the block `type` union
// has no "rich_text"/"header"/"section", `Attachment` has no `is_share`), so a real
// fixture can't be written against it. `SlackMessageFixture` accepts the literals
// via `unknown[]`, then we assert the result back to `MessageElement`.
function makeSlackMessage(fields: SlackMessageFixture): MessageElement {
  return { type: "message", ...fields } as MessageElement;
}

// Structure taken from a real `conversations.replies` payload, with all
// identifiable content replaced. A human posts a public link: the URL lives in
// `text`, a `rich_text` block repeats the exact same content, and Slack adds a
// link-unfurl attachment (from_url/original_url) previewing the URL.
const LINK_MESSAGE = makeSlackMessage({
  user: "U0POSTER0001",
  ts: "1720000000.000100",
  text: "*« Multiplayer AI » in the Fall 2026 RFS*\n<https://www.example.com/rfs#multiplayer-ai|https://www.example.com/rfs#multiplayer-ai> ",
  attachments: [
    {
      image_url: "https://static.example.com/assets/rfs/preview-image.jpg",
      from_url: "https://www.example.com/rfs#multiplayer-ai",
      id: 1,
      original_url: "https://www.example.com/rfs#multiplayer-ai",
      fallback: "Example: Requests for Startups | Example",
      text: "Example is looking for startups working on these ideas. If you're working on something we're interested in, we'd love to hear from you.",
      title: "Requests for Startups | Example",
      title_link: "https://www.example.com/rfs#multiplayer-ai",
      service_name: "Example",
    },
  ],
  blocks: [
    {
      type: "rich_text",
      block_id: "b0000",
      elements: [
        {
          type: "rich_text_section",
          elements: [
            {
              type: "text",
              text: "« Multiplayer AI » in the Fall 2026 RFS",
              style: { bold: true, italic: false },
            },
            { type: "text", text: "\n" },
            {
              type: "link",
              url: "https://www.example.com/rfs#multiplayer-ai",
              text: "https://www.example.com/rfs#multiplayer-ai",
            },
            { type: "text", text: " " },
          ],
        },
      ],
    },
  ],
});

// Structure taken from a real `conversations.replies` payload, with all
// identifiable content replaced. The author writes text (with a user mention), a
// `rich_text` block repeats it, and the shared message rides along as an
// `is_msg_unfurl` attachment.
const FORWARDED_MESSAGE = makeSlackMessage({
  user: "U0POSTER0002",
  ts: "1720000000.000200",
  text: ":wave: <@U0MENTION001> saw this and was wondering:\n=&gt; not sure, but I sense that:\n• either there's a good reason we did it\n• or it's an easy fix\nright?",
  attachments: [
    {
      fallback: "[Jan 1st, 2026 3:15 PM] a.author: Hi again (encore)",
      ts: "1719990000.000100",
      author_id: "U0FWDAUTHOR",
      author_subname: "A. Author",
      is_msg_unfurl: true,
      text: "Hi again (encore) :slightly_smiling_face:\n\nI built a few things today.\n\nBut when I try to use them in another setup, it doesn't work unless the helper is also attached.",
      author_name: "A. Author",
      color: "D0D0D0",
      from_url:
        "https://example.slack.com/archives/C0000000001/p1719990000000100",
      is_share: true,
      id: 1,
      footer: "Slack conversation",
    },
  ],
  blocks: [
    {
      type: "rich_text",
      block_id: "b0001",
      elements: [
        {
          type: "rich_text_section",
          elements: [
            { type: "emoji", name: "wave", unicode: "1f44b" },
            { type: "text", text: " " },
            { type: "user", user_id: "U0MENTION001" },
            {
              type: "text",
              text: " saw this and was wondering:\n=> not sure, but I sense that:\n",
            },
          ],
        },
        {
          type: "rich_text_list",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                {
                  type: "text",
                  text: "either there's a good reason we did it",
                },
              ],
            },
            {
              type: "rich_text_section",
              elements: [{ type: "text", text: "or it's an easy fix" }],
            },
          ],
          style: "bullet",
        },
        {
          type: "rich_text_section",
          elements: [{ type: "text", text: "right?" }],
        },
      ],
    },
  ],
});

describe("formatMessagesForUpsert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBotOrUserName.mockResolvedValue("grafana");
    mockGetUserInfo.mockResolvedValue({ name: "bob", email: null });
    mockGetChannelNameById.mockResolvedValue("general");
  });

  it("renders a human link message once (from blocks) and keeps the successful link preview", async () => {
    // `text` and the `rich_text` block carry the same content; we render the blocks (not
    // both), and the link-unfurl attachment resolved to a real preview we keep as content.
    const text = sectionFullText(await upsert([LINK_MESSAGE]));

    // The content comes through exactly once (from the blocks, not duplicated by `text`).
    expect(text.match(/Multiplayer AI/g)).toHaveLength(1);

    // The URL the user typed is preserved.
    expect(text).toContain("example.com/rfs#multiplayer-ai");

    // The successful preview is useful content, so it is kept.
    expect(text).toContain("Example is looking for startups");
    expect(text).toContain("Requests for Startups");
  });

  it("renders a forwarded message once and resolves the author's mention", async () => {
    // The author's own message (with a `<@U…>` mention echoed as a raw id in the
    // block) plus a forwarded (`is_msg_unfurl`) message.
    const text = sectionFullText(await upsert([FORWARDED_MESSAGE]));

    // The author's text comes through once, from `text` (not duplicated by the block).
    expect(text.match(/easy fix/g)).toHaveLength(1);
    expect(text).toContain("right?");

    // The mention is resolved to a name (from `text`), and the raw id from the
    // block is never rendered.
    expect(text).toContain("@bob");
    expect(text).not.toContain("U0MENTION001");

    // The forwarded message is rendered once, attributed to its author.
    expect(text).toContain("Forwarded from @A. Author:");
    expect(text.match(/I built a few things today/g)).toHaveLength(1);
  });

  it("resolves a channel mention in a rich_text block to its name", async () => {
    mockGetChannelNameById.mockResolvedValue("general");

    // A human message mentioning a channel: the bare channel id lives in a typed
    // `rich_text` element, which the formatter emits as a `<#C…>` token.
    const message = makeSlackMessage({
      user: "U1",
      ts: "1720000000.000600",
      blocks: [
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                { type: "text", text: "ping " },
                { type: "channel", channel_id: "C0GENERAL01" },
                { type: "text", text: " please" },
              ],
            },
          ],
        },
      ],
    });

    const text = sectionFullText(await upsert([message]));

    // Resolved to `#name`; neither the raw id nor the token leaks.
    expect(text).toContain("ping #general please");
    expect(text).not.toContain("C0GENERAL01");
    expect(text).not.toContain("<#");
  });

  it("reconstructs a block-only bot alert whose top-level text is empty", async () => {
    // The original bug: empty `text`, content lives entirely in the blocks. With
    // no `text` fallback to fall back on, we reconstruct from the blocks.
    const message = makeSlackMessage({
      bot_id: "B1",
      ts: "1720000000.000400",
      text: "",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "[FIRING] tax-service" },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: "*Summary*: service is down" },
        },
      ],
    });

    const text = sectionFullText(await upsert([message]));

    expect(text).toContain("[FIRING] tax-service");
    expect(text).toContain("Summary");
    expect(text).toContain("service is down");
    expect(text).not.toContain("(empty)");
  });

  it("reconstructs a block-only bot alert's content from a legacy attachment when text is empty", async () => {
    // Some alerts (e.g. Grafana/Zendesk) carry their content in a legacy
    // attachment card rather than blocks. With empty `text`, it must surface.
    const message = makeSlackMessage({
      bot_id: "B1",
      ts: "1720000000.000500",
      text: "",
      attachments: [
        {
          title: "Grafana",
          text: "CPU above 90% on api-1",
          fallback: "CPU alert",
        },
      ],
    });

    const text = sectionFullText(await upsert([message]));

    expect(text).toContain("Grafana");
    expect(text).toContain("CPU above 90% on api-1");
  });
});
