import { apiError, privateApiError } from "@front-api/middlewares/utils";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

describe("privateApiError", () => {
  it("omits `message` when the handler doesn't provide one", async () => {
    const app = new Hono().get("/", (c) =>
      privateApiError(c, {
        status_code: 404,
        api_error: { type: "user_not_found" },
      })
    );

    const response = await app.request("/");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { type: "user_not_found" },
    });
  });
});

describe("apiError", () => {
  it("sends the message it requires", async () => {
    const app = new Hono().get("/", (c) =>
      apiError(c, {
        status_code: 404,
        api_error: { type: "user_not_found", message: "User not found." },
      })
    );

    const response = await app.request("/");

    expect(await response.json()).toEqual({
      error: { type: "user_not_found", message: "User not found." },
    });
  });
});
