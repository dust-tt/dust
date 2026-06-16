import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

// The chat route allows a request whose Origin OR Referer starts with the
// static website URL. In this test environment the `Origin` header is stripped
// by the fetch/cors path that `honoApp.request` runs through, but `Referer`
// passes through to the handler — so we drive the allowed-origin checks with a
// Referer. The static website URL resolves to "http://fake-url" (set in
// front/vite.globalSetup.ts via NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL).
const ALLOWED_REFERER = "http://fake-url/academy";

// Issue a CSRF token through the GET endpoint (the same secret signs and
// verifies within the service) so POST tests reuse a genuinely valid token.
async function getCsrfToken(): Promise<string> {
  const response = await honoApp.request("/api/marketing/academy/chat", {
    headers: { referer: ALLOWED_REFERER },
  });
  const body = await response.json();
  return body.csrfToken;
}

// The academy quiz endpoints are public (no session), so the chat route gates
// on the request originating from the marketing website. A request without a
// matching Origin/Referer must be rejected before any CSRF / LLM work.
describe("GET /api/marketing/academy/chat", () => {
  it("rejects a CSRF token request with a disallowed referer", async () => {
    const response = await honoApp.request("/api/marketing/academy/chat", {
      headers: { referer: "https://evil.example.com" },
    });

    expect(response.status).toBe(403);
  });

  it("issues a CSRF token when the referer is allowed", async () => {
    const response = await honoApp.request("/api/marketing/academy/chat", {
      headers: { referer: ALLOWED_REFERER },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.csrfToken).toBe("string");
    expect(body.csrfToken.length).toBeGreaterThan(0);
  });
});

describe("POST /api/marketing/academy/chat", () => {
  const validBody = {
    messages: [],
    contentType: "chapter",
    title: "Intro to Dust",
    content: "Some chapter content.",
    correctAnswers: 0,
    totalQuestions: 0,
  };

  it("rejects a chat request with a disallowed referer", async () => {
    const response = await honoApp.request("/api/marketing/academy/chat", {
      method: "POST",
      headers: {
        referer: "https://evil.example.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
  });

  it("rejects an allowed-origin request without a CSRF token", async () => {
    const response = await honoApp.request("/api/marketing/academy/chat", {
      method: "POST",
      headers: {
        referer: ALLOWED_REFERER,
        "content-type": "application/json",
      },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(403);
  });

  it("rejects an allowed-origin request with an invalid CSRF token", async () => {
    const response = await honoApp.request("/api/marketing/academy/chat", {
      method: "POST",
      headers: {
        referer: ALLOWED_REFERER,
        "content-type": "application/json",
        "x-csrf-token": "not-a-valid-token",
      },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(403);
  });

  it("rejects a malformed body even with a valid CSRF token", async () => {
    const csrfToken = await getCsrfToken();

    const response = await honoApp.request("/api/marketing/academy/chat", {
      method: "POST",
      headers: {
        referer: ALLOWED_REFERER,
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ contentType: "chapter" }),
    });

    expect(response.status).toBe(400);
  });

  it("returns 500 when the chat service is not configured", async () => {
    // The request passes origin + CSRF + rate limit + body validation; it then
    // fails because DUST_MANAGED_ANTHROPIC_API_KEY is unset in the test env
    // (vite.globalSetup.ts resets process.env to a fixed allowlist).
    const csrfToken = await getCsrfToken();

    const response = await honoApp.request("/api/marketing/academy/chat", {
      method: "POST",
      headers: {
        referer: ALLOWED_REFERER,
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(500);
  });
});
