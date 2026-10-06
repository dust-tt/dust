import { getSlackI18n } from "@connectors/connectors/slack/lib/i18n";
import logger from "@connectors/logger/logger";
import type { I18n } from "@lingui/core";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  let i18n: I18n;

  beforeAll(async () => {
    i18n = await getSlackI18n("en-US");
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces project tasks, mentions, and quickReply for Slack", () => {
    const input =
      'Hello :mention[Agent]{sId=a1} — :project_task[Ship feature]{sId=todo_1} :quickReply[Go]{message="Do it"}';
    expect(formatAgentMarkdownForSlack(i18n, input)).toBe(
      "Hello @Agent — *Task:* Ship feature _Go_ — _Do it_"
    );
  });

  it("turns agent mentions into Slack links when workspace + conversation are provided", () => {
    const input = "Ping :mention[My Agent]{sId=agent_conf_1} please";
    const out = formatAgentMarkdownForSlack(i18n, input, {
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
    const input = "See :cite[ab] and :project_task[X]{sId=t}";
    expect(formatAgentMarkdownForSlack(i18n, input)).toBe(
      "See :cite[ab] and *Task:* X"
    );
  });

  it("replaces toolSetup and visualization blocks", () => {
    const input = `Before\n:::visualization\n{"x":1}\n:::\nAfter :toolSetup[Connect Notion]{sId=notion}`;
    expect(formatAgentMarkdownForSlack(i18n, input)).toBe(
      "Before\n_Visualization_\n\nAfter _Connect Notion_"
    );
  });

  it("does not log unsupported directives when option is off", () => {
    const spy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    formatAgentMarkdownForSlack(i18n, ":unknownDirective[hi]{x=1}", {
      logUnsupportedDirectives: false,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs when unsupported directives remain on full message", () => {
    const spy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    formatAgentMarkdownForSlack(i18n, "Text :unknownDirective[hi]{x=1} tail", {
      logUnsupportedDirectives: true,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      unsupportedDirectives: ["unknownDirective"],
    });
  });

  it("does not log for cite-only remaining colon-directive syntax", () => {
    const spy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    formatAgentMarkdownForSlack(i18n, "Ref :cite[ab, cd] done", {
      logUnsupportedDirectives: true,
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
