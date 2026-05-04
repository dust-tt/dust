import logger from "@connectors/logger/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMakeAgentDetailsInConversationUrl = vi.hoisted(() =>
  vi.fn(
    (
      workspaceId: string,
      conversationId: string,
      agentConfigurationId: string
    ) =>
      `https://dust.test/w/${workspaceId}/conversation/${conversationId}?agentDetails=${agentConfigurationId}`
  )
);

vi.mock("@connectors/lib/bot/conversation_utils", () => ({
  makeAgentDetailsInConversationUrl: mockMakeAgentDetailsInConversationUrl,
}));

import { formatAgentMarkdownForSlack } from "./format_agent_markdown_for_slack";

describe("formatAgentMarkdownForSlack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces project todos, mentions, and quickReply for Slack", () => {
    const input =
      'Hello :mention[Agent]{sId=a1} — :todo[Ship feature]{sId=todo_1} :quickReply[Go]{message="Do it"}';
    expect(formatAgentMarkdownForSlack(input)).toBe(
      "Hello @Agent — *Todo:* Ship feature _Go_ — _Do it_"
    );
  });

  it("turns agent mentions into Slack links when workspace + conversation are provided", () => {
    const input = "Ping :mention[My Agent]{sId=agent_conf_1} please";
    const out = formatAgentMarkdownForSlack(input, {
      agentMentionLinkContext: {
        workspaceId: "ws_test",
        conversationId: "conv_abc",
      },
    });
    expect(out).toBe(
      "Ping <https://dust.test/w/ws_test/conversation/conv_abc?agentDetails=agent_conf_1|@My Agent> please"
    );
    expect(mockMakeAgentDetailsInConversationUrl).toHaveBeenCalledWith(
      "ws_test",
      "conv_abc",
      "agent_conf_1"
    );
  });

  it("leaves cite markers for annotateCitations", () => {
    const input = "See :cite[ab] and :todo[X]{sId=t}";
    expect(formatAgentMarkdownForSlack(input)).toBe(
      "See :cite[ab] and *Todo:* X"
    );
  });

  it("replaces toolSetup and visualization blocks", () => {
    const input = `Before\n:::visualization\n{"x":1}\n:::\nAfter :toolSetup[Connect Notion]{sId=notion}`;
    expect(formatAgentMarkdownForSlack(input)).toBe(
      "Before\n_Visualization_\n\nAfter _Connect Notion_"
    );
  });

  it("does not log unsupported directives when option is off", () => {
    const spy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    formatAgentMarkdownForSlack(":unknownDirective[hi]{x=1}", {
      logUnsupportedDirectives: false,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs when unsupported directives remain on full message", () => {
    const spy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    formatAgentMarkdownForSlack("Text :unknownDirective[hi]{x=1} tail", {
      logUnsupportedDirectives: true,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      unsupportedDirectives: ["unknownDirective"],
    });
  });

  it("does not log for cite-only remaining colon-directive syntax", () => {
    const spy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    formatAgentMarkdownForSlack("Ref :cite[ab, cd] done", {
      logUnsupportedDirectives: true,
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
