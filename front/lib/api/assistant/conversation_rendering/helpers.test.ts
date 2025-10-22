import { describe, expect, it } from "vitest";

import type { TextContent } from "@app/types";

import { renderUserMessage } from "./helpers";

describe("renderUserMessage", () => {
  function buildMessage(overrides: Partial<any> = {}) {
    // We only include the fields used by renderUserMessage to keep the test
    // simple. The type used in production has many more fields, but they are
    // not needed here.
    return {
      content: "",
      ...overrides,
    } as any;
  }

  it("replaces :mention[name]{...} with @name", () => {
    const m = buildMessage({
      content: "Hello :mention[John Doe]{user_123}, how are you?",
      context: {},
    });

    const res = renderUserMessage(m);

    expect(res.role).toBe("user");
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    expect(text).toContain("@John Doe");
    expect(text).not.toContain(":mention[John Doe]{user_123}");
  });

  it("adds Sender metadata with full name, username and email", () => {
    const m = buildMessage({
      content: "Hello!",
      context: {
        fullName: "John Doe",
        username: "jdoe",
        email: "john@example.com",
      },
    });

    const res = renderUserMessage(m);
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    // Should include a dust system block and a Sender line.
    expect(text.startsWith("<dust_system>\n")).toBe(true);
    expect(text).toContain("- Sender: John Doe (@jdoe) <john@example.com>");

    // Name should prefer fullName when available.
    expect(res.name).toBe("John Doe");
  });

  it("uses username as name when fullName is not provided", () => {
    const m = buildMessage({
      content: "Hello!",
      context: {
        username: "jdoe",
      },
    });

    const res = renderUserMessage(m);

    expect(res.name).toBe("jdoe");
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;
    expect(text).toContain("- Sender: @jdoe");
  });

  it("adds sent at metadata when created is provided (timezone stable via context)", () => {
    const m = buildMessage({
      content: "Ping",
      created: "2025-01-15T12:34:56.000Z",
      context: { timezone: "UTC" },
    });

    const res = renderUserMessage(m);
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    // We do not assert exact date formatting (locale-dependent). We only check
    // that the line is present and not empty.
    const sentAtLine = text
      .split("\n")
      .find((l) => l.startsWith("- Sent at: "));

    expect(sentAtLine).toBeDefined();
    expect(sentAtLine && sentAtLine.length).toBeGreaterThan(
      "- Sent at: ".length
    );
  });

  it("adds trigger source metadata and previous run when origin is 'triggered'", () => {
    const m = buildMessage({
      content: "Scheduled report",
      context: {
        origin: "triggered",
        lastTriggerRunAt: "2025-01-10T08:00:00.000Z",
        timezone: "UTC",
      },
    });

    const res = renderUserMessage(m);
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    expect(text).toContain("- Source: Scheduled trigger");

    const prevRunLine = text
      .split("\n")
      .find((l) => l.startsWith("- Previous scheduled run: "));

    expect(prevRunLine).toBeDefined();
  });

  it("adds generic source metadata when origin is provided (non-triggered)", () => {
    const m = buildMessage({
      content: "From email",
      context: {
        origin: "email",
      },
    });

    const res = renderUserMessage(m);
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    expect(text).toContain("- Source: email");
  });

  it("does not include system context when no metadata is available", () => {
    const m = buildMessage({ content: "Just text", context: {} });

    const res = renderUserMessage(m);
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    expect(text.startsWith("<dust_system>")).toBe(false);
    expect(text).toBe("Just text");
  });
});
