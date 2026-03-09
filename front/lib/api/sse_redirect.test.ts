import { getSseRedirectPathname } from "@app/lib/api/sse_redirect";
import { describe, expect, test } from "vitest";

describe("getSseRedirectPathname", () => {
  test("redirects conversation events to /api/sse/", () => {
    expect(
      getSseRedirectPathname(
        "/api/w/abc123/assistant/conversations/conv456/events"
      )
    ).toBe("/api/sse/w/abc123/assistant/conversations/conv456/events");
  });

  test("redirects message events to /api/sse/", () => {
    expect(
      getSseRedirectPathname(
        "/api/w/abc123/assistant/conversations/conv456/messages/msg789/events"
      )
    ).toBe(
      "/api/sse/w/abc123/assistant/conversations/conv456/messages/msg789/events"
    );
  });

  test("redirects v1 conversation events to /api/sse/", () => {
    expect(
      getSseRedirectPathname(
        "/api/v1/w/abc123/assistant/conversations/conv456/events"
      )
    ).toBe("/api/sse/v1/w/abc123/assistant/conversations/conv456/events");
  });

  test("redirects v1 message events to /api/sse/", () => {
    expect(
      getSseRedirectPathname(
        "/api/v1/w/abc123/assistant/conversations/conv456/messages/msg789/events"
      )
    ).toBe(
      "/api/sse/v1/w/abc123/assistant/conversations/conv456/messages/msg789/events"
    );
  });

  test("does not redirect paths already on /api/sse/", () => {
    expect(
      getSseRedirectPathname(
        "/api/sse/w/abc123/assistant/conversations/conv456/events"
      )
    ).toBeNull();
  });

  test("does not redirect non-SSE API paths", () => {
    expect(
      getSseRedirectPathname(
        "/api/w/abc123/assistant/conversations/conv456/messages"
      )
    ).toBeNull();
  });

  test("does not redirect unrelated API paths", () => {
    expect(getSseRedirectPathname("/api/v1/w/abc123/spaces")).toBeNull();
  });

  test("does not redirect non-API paths", () => {
    expect(
      getSseRedirectPathname("/w/abc123/assistant/conversations/conv456/events")
    ).toBeNull();
  });
});
