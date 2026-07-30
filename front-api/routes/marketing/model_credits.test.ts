import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/marketing/model-credits", () => {
  it("returns the public model credits table", async () => {
    const response = await honoApp.request("/api/marketing/model-credits");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);

    const [model] = body.models;
    expect(typeof model.modelId).toBe("string");
    expect(typeof model.displayName).toBe("string");
    expect(typeof model.modelMaker).toBe("string");
    expect(typeof model.modelMakerDisplayName).toBe("string");
    expect(typeof model.inputCreditsPerMTokens).toBe("number");
    expect(typeof model.outputCreditsPerMTokens).toBe("number");
  });
});
