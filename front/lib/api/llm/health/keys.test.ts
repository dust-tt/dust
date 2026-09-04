import {
  minuteBucket,
  modelHealthKey,
  windowMinuteBuckets,
} from "@app/lib/api/llm/health/keys";
import { describe, expect, it } from "vitest";

const ENDPOINT = {
  modelId: "claude-sonnet-5",
  providerId: "anthropic",
  host: "anthropic",
} as const;

describe("model health keys", () => {
  it("buckets minutes in UTC", () => {
    expect(minuteBucket(new Date("2026-09-03T14:32:59.999Z"))).toBe(
      "202609031432"
    );
  });

  it("builds a key per endpoint and minute", () => {
    expect(modelHealthKey(ENDPOINT, "202609031432")).toBe(
      "mh:anthropic:claude-sonnet-5:anthropic:202609031432"
    );
  });

  it("keeps the two hosts serving the same model apart", () => {
    const viaAgentPlatform = {
      ...ENDPOINT,
      host: "agent-platform",
    } as const;

    expect(modelHealthKey(ENDPOINT, "202609031432")).not.toBe(
      modelHealthKey(viaAgentPlatform, "202609031432")
    );
  });

  it("tolerates the slashes in a Fireworks model id", () => {
    expect(
      modelHealthKey(
        {
          modelId: "accounts/fireworks/models/kimi-k3",
          providerId: "fireworks",
          host: "fireworks",
        },
        "202609031432"
      )
    ).toBe(
      "mh:fireworks:accounts/fireworks/models/kimi-k3:fireworks:202609031432"
    );
  });

  it("covers the window backwards from now, inclusive", () => {
    expect(windowMinuteBuckets(new Date("2026-09-03T14:32:10Z"))).toEqual([
      "202609031428",
      "202609031429",
      "202609031430",
      "202609031431",
      "202609031432",
    ]);
  });
});
