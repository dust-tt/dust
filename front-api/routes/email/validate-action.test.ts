import { generateValidationToken } from "@app/lib/api/email/validation_token";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

process.env.EMAIL_VALIDATION_SECRET ||= "test-email-validation-secret";

const VALIDATE_ACTION_PATH = "/api/email/validate-action";

describe("POST /api/email/validate-action", () => {
  it("returns 400 when the token is missing", async () => {
    const res = await honoApp.request(VALIDATE_ACTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("Missing or invalid token parameter.");
  });

  it("accepts a form-encoded token (the validation page posts a plain HTML form)", async () => {
    const token = generateValidationToken("bogus-action-id", "approved");

    const res = await honoApp.request(VALIDATE_ACTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });

    // The token is read from the form body: the request gets past the 400
    // token check and redirects to the validation result page.
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/email/validation?status=");
  });

  it("accepts a JSON-encoded token", async () => {
    const token = generateValidationToken("bogus-action-id", "approved");

    const res = await honoApp.request(VALIDATE_ACTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/email/validation?status=");
  });
});
