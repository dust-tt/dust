import { slackMrkdwnToText } from "@app/lib/api/actions/servers/slack/slack_mrkdwn";
import { describe, expect, it } from "vitest";

describe("slackMrkdwnToText", () => {
  it("keeps literal characters in code spans", () => {
    expect(slackMrkdwnToText("Run `a & b <c>` now")).toBe("Run a & b <c> now");
  });

  it("renders mentions and links as readable text", () => {
    expect(
      slackMrkdwnToText("<@U123|ada> see <https://e.com|docs> in <#C1|general>")
    ).toBe("@ada see docs (https://e.com) in #general");
  });
});
