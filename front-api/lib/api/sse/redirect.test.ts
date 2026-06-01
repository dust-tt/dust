import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

function requestSseRedirect(routePattern: string, path: string) {
  const app = new Hono();
  app.get(routePattern, redirectToSse);
  return app.request(path, { redirect: "manual" });
}

describe("redirectToSse", () => {
  it.each([
    {
      name: "message events",
      routePattern:
        "/api/v1/w/:wId/assistant/conversations/:cId/messages/:mId/events",
      path: "/api/v1/w/w1/assistant/conversations/c1/messages/m1/events",
      expected:
        "/api/sse/v1/w/w1/assistant/conversations/c1/messages/m1/events",
    },
    {
      name: "conversation events",
      routePattern: "/api/v1/w/:wId/assistant/conversations/:cId/events",
      path: "/api/v1/w/w1/assistant/conversations/c1/events",
      expected: "/api/sse/v1/w/w1/assistant/conversations/c1/events",
    },
    {
      name: "private mcp requests",
      routePattern: "/api/w/:wId/mcp/requests",
      path: "/api/w/w1/mcp/requests",
      expected: "/api/sse/w/w1/mcp/requests",
    },
  ])("rewrites the leading /api/ segment to /api/sse/ for the $name path", async ({
    routePattern,
    path,
    expected,
  }) => {
    const res = await requestSseRedirect(routePattern, path);

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(expected);
  });

  it("preserves the query string on the redirected location", async () => {
    const res = await requestSseRedirect(
      "/api/v1/w/:wId/assistant/conversations/:cId/events",
      "/api/v1/w/w1/assistant/conversations/c1/events?foo=bar"
    );

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe(
      "/api/sse/v1/w/w1/assistant/conversations/c1/events"
    );
    expect(location.search).toBe("?foo=bar");
  });
});
