import { formatSlackMessageForLLM } from "@app/lib/api/actions/servers/slack/message_formatter";
import { describe, expect, it } from "vitest";

describe("formatSlackMessageForLLM", () => {
  it("renders a Datadog-like block-only alert (text empty)", () => {
    const result = formatSlackMessageForLLM({
      text: "",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Triggered: API Errors" },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Service:* backend\n*Env:* production",
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: "*Status:*\nTriggered" },
            { type: "mrkdwn", text: "*Priority:*\nP1" },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View in Datadog" },
              url: "https://app.datadoghq.com/monitors/123",
            },
          ],
        },
      ],
    });

    expect(result).toContain("Triggered: API Errors");
    expect(result).toContain("Service: backend");
    expect(result).toContain("Env: production");
    expect(result).toContain("Status: Triggered");
    expect(result).toContain("Priority: P1");
    expect(result).toContain("View in Datadog");
    expect(result).toContain("https://app.datadoghq.com/monitors/123");
  });

  it("returns the plain text when there are no blocks", () => {
    expect(formatSlackMessageForLLM({ text: "hello world", blocks: [] })).toBe(
      "hello world"
    );
  });

  it("returns empty string for an empty message", () => {
    expect(formatSlackMessageForLLM({ text: "", blocks: [] })).toBe("");
    expect(formatSlackMessageForLLM({})).toBe("");
  });

  it("does not duplicate content shared between text and blocks", () => {
    const result = formatSlackMessageForLLM({
      text: "Deploy finished",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "Deploy finished" },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: "All services healthy" },
        },
      ],
    });

    const occurrences = result
      .split("\n")
      .filter((line) => line === "Deploy finished").length;
    expect(occurrences).toBe(1);
    expect(result).toContain("All services healthy");
  });

  it("renders rich_text blocks including links and mentions", () => {
    const result = formatSlackMessageForLLM({
      text: "",
      blocks: [
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                { type: "text", text: "See " },
                {
                  type: "link",
                  url: "https://example.com",
                  text: "the report",
                },
                { type: "text", text: " cc " },
                { type: "user", user_id: "U123" },
              ],
            },
            {
              type: "rich_text_list",
              style: "bullet",
              elements: [
                {
                  type: "rich_text_section",
                  elements: [{ type: "text", text: "first item" }],
                },
                {
                  type: "rich_text_section",
                  elements: [{ type: "text", text: "second item" }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result).toContain("See the report (https://example.com) cc @U123");
    expect(result).toContain("- first item");
    expect(result).toContain("- second item");
  });

  it("extracts content from attachments (pretext, title, text, fields)", () => {
    const result = formatSlackMessageForLLM({
      text: "",
      attachments: [
        {
          pretext: "New ticket",
          title: "Login broken",
          text: "Users cannot log in",
          fallback: "Login broken - Users cannot log in",
          fields: [
            { title: "Severity", value: "High" },
            { title: "Assignee", value: "Jane" },
          ],
        },
      ],
    });

    expect(result).toContain("New ticket");
    expect(result).toContain("Login broken");
    expect(result).toContain("Users cannot log in");
    expect(result).toContain("Severity: High");
    expect(result).toContain("Assignee: Jane");
  });

  it("cleans Slack mrkdwn links and user mentions in plain text", () => {
    const result = formatSlackMessageForLLM({
      text: "Ping <@U050CALAKFD|someone> see <https://dust.tt|docs>",
    });

    expect(result).toBe("Ping @someone see docs (https://dust.tt)");
  });

  it("appends file info when present", () => {
    const result = formatSlackMessageForLLM({
      text: "Report attached",
      files: [{ name: "report.pdf", mimetype: "application/pdf" }],
    });

    expect(result).toContain("Report attached");
    expect(result).toContain("Attached file: report.pdf (application/pdf)");
  });

  it("ignores malformed blocks without throwing", () => {
    const result = formatSlackMessageForLLM({
      text: "ok",
      blocks: [null, "nope", 42, { type: "section" }, { type: "divider" }],
    });

    expect(result).toBe("ok");
  });
});
