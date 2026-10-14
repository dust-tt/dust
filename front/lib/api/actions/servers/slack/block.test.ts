import {
  makeMessagePayload,
  makeMrkdwnText,
} from "@app/lib/api/actions/servers/slack/block";
import slackifyMarkdown from "slackify-markdown";
import { describe, expect, it } from "vitest";

const FOOTER = { agentName: "Reporter", agentUrl: "https://dust.tt/agent" };
const FOOTER_TEXT = "_Sent via <https://dust.tt/agent|Reporter Agent> on Dust_";

describe("makeMessagePayload", () => {
  it("sends a message without a table as plain mrkdwn with the footer inline", () => {
    const message =
      "**Daily report**\n\n- item one\n- item two\n\n---\n\na | b\n\n```\n| a | b |\n| --- | --- |\n```";

    expect(makeMessagePayload(message, FOOTER)).toEqual({
      text: `${slackifyMarkdown(message)}\n${FOOTER_TEXT}`,
    });
    expect(makeMessagePayload(message, undefined)).toEqual({
      text: slackifyMarkdown(message),
    });
  });

  it.each([
    "| Team | Score |\n| --- | --- |\n| A | 1 |",
    "Intro\n\nTeam | Score\n:--- | ---:\nA | 1",
    "> | Team | Score |\n> | --- | --- |\n> | A | 1 |",
  ])(
    "sends a message with a table as a markdown block with a footer block",
    (message) => {
      expect(makeMessagePayload(message, FOOTER)).toEqual({
        text: message,
        blocks: [
          { type: "markdown", text: message },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: FOOTER_TEXT }],
          },
        ],
      });
    }
  );
});

describe("makeMessagePayload length", () => {
  it("keeps a long table message whole in both the block and the fallback text", () => {
    const message = `| a | b |\n| --- | --- |\n${"x".repeat(5_000)}`;
    const payload = makeMessagePayload(message, undefined);

    expect(payload.text).toBe(message);
    expect(payload.blocks).toEqual([{ type: "markdown", text: message }]);
  });
});

describe("makeMrkdwnText", () => {
  it("keeps long messages whole, even with a table, and appends the footer", () => {
    const message = `| a | b |\n| --- | --- |\n${"x".repeat(5_000)}`;

    expect(makeMrkdwnText(message, FOOTER)).toBe(
      `${slackifyMarkdown(message)}\n${FOOTER_TEXT}`
    );
    expect(makeMrkdwnText(message, undefined)).toBe(slackifyMarkdown(message));
  });
});
