import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

// The progress endpoints accept an optional session and otherwise fall back to
// an anonymous `X-Academy-Browser-Id` (a UUID). These tests exercise the
// anonymous path end-to-end against the real DB; each test runs in its own
// rolled-back transaction so a fresh browser id per suite is fine.
const BROWSER_ID = "a0000000-0000-4000-8000-000000000001";

function browserHeaders(extra: Record<string, string> = {}) {
  return { "x-academy-browser-id": BROWSER_ID, ...extra };
}

function jsonHeaders(extra: Record<string, string> = {}) {
  return browserHeaders({ "content-type": "application/json", ...extra });
}

describe("GET /api/marketing/academy/progress", () => {
  it("returns 401 when neither a session nor a browser id is provided", async () => {
    const response = await honoApp.request(
      "/api/marketing/academy/progress?contentType=chapter&contentSlug=intro"
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when query parameters are missing", async () => {
    const response = await honoApp.request("/api/marketing/academy/progress", {
      headers: browserHeaders(),
    });

    expect(response.status).toBe(400);
  });

  it("returns null progress when the content has no attempts", async () => {
    const response = await honoApp.request(
      "/api/marketing/academy/progress?contentType=chapter&contentSlug=intro",
      { headers: browserHeaders() }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.progress).toBeNull();
  });
});

describe("POST /api/marketing/academy/progress", () => {
  it("records a passing attempt and reports it as a new completion", async () => {
    const response = await honoApp.request("/api/marketing/academy/progress", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        contentType: "chapter",
        contentSlug: "intro",
        courseSlug: "basics",
        correctAnswers: 4,
        totalQuestions: 5,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.attempt).toMatchObject({
      contentType: "chapter",
      contentSlug: "intro",
      correctAnswers: 4,
      totalQuestions: 5,
      isPassed: true,
    });
    // The attempt is identified by its string sId, never the internal ModelId.
    expect(typeof body.attempt.sId).toBe("string");
    expect(body.isNewCompletion).toBe(true);
  });

  it("does not mark a failing attempt as a completion", async () => {
    const response = await honoApp.request("/api/marketing/academy/progress", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        contentType: "chapter",
        contentSlug: "intro",
        correctAnswers: 1,
        totalQuestions: 5,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.attempt.isPassed).toBe(false);
    expect(body.isNewCompletion).toBe(false);
  });

  it("returns 400 for a malformed body", async () => {
    const response = await honoApp.request("/api/marketing/academy/progress", {
      method: "POST",
      headers: jsonHeaders(),
      // totalQuestions must be a positive integer.
      body: JSON.stringify({
        contentType: "chapter",
        contentSlug: "intro",
        correctAnswers: 0,
        totalQuestions: 0,
      }),
    });

    expect(response.status).toBe(400);
  });

  it("surfaces a recorded attempt through GET progress", async () => {
    const postResponse = await honoApp.request(
      "/api/marketing/academy/progress",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          contentType: "lesson",
          contentSlug: "lesson-1",
          correctAnswers: 5,
          totalQuestions: 5,
        }),
      }
    );
    expect(postResponse.status).toBe(201);

    const getResponse = await honoApp.request(
      "/api/marketing/academy/progress?contentType=lesson&contentSlug=lesson-1",
      { headers: browserHeaders() }
    );

    expect(getResponse.status).toBe(200);
    const body = await getResponse.json();
    expect(body.progress).toMatchObject({
      attemptCount: 1,
      bestScore: 5,
      isCompleted: true,
    });
    expect(typeof body.progress.lastAttemptAt).toBe("string");
  });
});

describe("GET /api/marketing/academy/progress/courses", () => {
  it("aggregates chapter attempts under their course, with no caching", async () => {
    await honoApp.request("/api/marketing/academy/progress", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        contentType: "chapter",
        contentSlug: "intro",
        courseSlug: "basics",
        correctAnswers: 4,
        totalQuestions: 5,
      }),
    });

    const response = await honoApp.request(
      "/api/marketing/academy/progress/courses",
      { headers: browserHeaders() }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.courseProgress.basics.completedChapterSlugs).toContain("intro");
    expect(body.courseProgress.basics.attemptedChapterSlugs).toContain("intro");
  });
});

describe("POST /api/marketing/academy/progress/visit", () => {
  it("records a chapter visit", async () => {
    const response = await honoApp.request(
      "/api/marketing/academy/progress/visit",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          courseSlug: "basics",
          chapterSlug: "intro",
        }),
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("returns 400 for a malformed visit body", async () => {
    const response = await honoApp.request(
      "/api/marketing/academy/progress/visit",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ courseSlug: "basics" }),
      }
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /api/marketing/academy/progress/backfill", () => {
  it("requires an authenticated session", async () => {
    const response = await honoApp.request(
      "/api/marketing/academy/progress/backfill",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ browserId: BROWSER_ID }),
      }
    );

    expect(response.status).toBe(401);
  });
});
