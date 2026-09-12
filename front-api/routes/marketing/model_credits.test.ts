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

  it("excludes models still gated behind an on-demand feature flag", async () => {
    const response = await honoApp.request("/api/marketing/model-credits");
    const body = await response.json();
    const modelIds = body.models.map(
      (model: { modelId: string }) => model.modelId
    );

    // Models that remain feature-flagged.
    expect(modelIds).not.toContain("deepseek-chat");
    expect(modelIds).not.toContain("o1");
    // Gated by featureFlag even though plansWithAdvancedModels is also set.
    expect(modelIds).not.toContain("claude-opus-4-6");
  });

  it("includes released Grok models", async () => {
    const response = await honoApp.request("/api/marketing/model-credits");
    const body = await response.json();
    const modelIds = body.models.map(
      (model: { modelId: string }) => model.modelId
    );

    expect(modelIds).toContain("grok-4.5");
    expect(modelIds).toContain("grok-4.6");
  });

  it("excludes legacy models", async () => {
    const response = await honoApp.request("/api/marketing/model-credits");
    const body = await response.json();
    const modelIds = body.models.map(
      (model: { modelId: string }) => model.modelId
    );

    expect(modelIds).not.toContain("claude-3-opus-20240229");
  });
});
