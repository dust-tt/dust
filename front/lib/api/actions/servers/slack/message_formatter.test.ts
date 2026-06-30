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

    // Top-level text was empty; all content was reconstructed from the blocks.
    expect(result.text).toBe("(empty)");
    expect(result.blocks).toContain("Triggered: API Errors");
    expect(result.blocks).toContain("Service: backend");
    expect(result.blocks).toContain("Env: production");
    expect(result.blocks).toContain("Status: Triggered");
    expect(result.blocks).toContain("Priority: P1");
    expect(result.blocks).toContain("View in Datadog");
    expect(result.blocks).toContain("https://app.datadoghq.com/monitors/123");
  });

  it("returns the plain text when there are no blocks", () => {
    const result = formatSlackMessageForLLM({
      text: "hello world",
      blocks: [],
    });
    expect(result.text).toBe("hello world");
    expect(result.blocks).toBe("(empty)");
  });

  it("marks every source as empty for an empty message", () => {
    const result = formatSlackMessageForLLM({});
    expect(result.text).toBe("(empty)");
    expect(result.blocks).toBe("(empty)");
    expect(result.attachments).toBe("(empty)");
    expect(result.files).toBe("(empty)");
  });

  it("keeps text and block content in separate fields", () => {
    const result = formatSlackMessageForLLM({
      text: "Deploy finished",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "Service A healthy" },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: "Service B healthy" },
        },
      ],
    });

    expect(result.text).toBe("Deploy finished");
    expect(result.blocks).toContain("Service A healthy");
    expect(result.blocks).toContain("Service B healthy");
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

    expect(result.blocks).toContain(
      "See the report (https://example.com) cc @U123"
    );
    expect(result.blocks).toContain("- first item");
    expect(result.blocks).toContain("- second item");
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

    expect(result.attachments).toContain("New ticket");
    expect(result.attachments).toContain("Login broken");
    expect(result.attachments).toContain("Users cannot log in");
    expect(result.attachments).toContain("Severity: High");
    expect(result.attachments).toContain("Assignee: Jane");
  });

  it("cleans Slack mrkdwn links and user mentions in plain text", () => {
    const result = formatSlackMessageForLLM({
      text: "Ping <@U050CALAKFD|someone> see <https://dust.tt|docs>",
    });

    expect(result.text).toBe("Ping @someone see docs (https://dust.tt)");
  });

  it("exposes file info in the files field", () => {
    const result = formatSlackMessageForLLM({
      text: "Report attached",
      files: [{ name: "report.pdf", mimetype: "application/pdf" }],
    });

    expect(result.text).toBe("Report attached");
    expect(result.files).toContain(
      "Attached file: report.pdf (application/pdf)"
    );
  });

  it("falls back to the text when blocks fail schema validation", () => {
    const result = formatSlackMessageForLLM({
      text: "ok",
      blocks: [null, "nope", 42],
    });

    // Malformed blocks no longer pass zod validation: we surface the raw text
    // instead of silently dropping content (and log a warning).
    expect(result.text).toBe("ok");
    expect(result.blocks).toContain("could not parse");
  });
});
