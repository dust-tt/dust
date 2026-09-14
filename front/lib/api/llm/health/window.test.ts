import {
  ATTEMPTS_FIELD,
  modelHealthKey,
  PROVIDER_ERRORS_FIELD,
} from "@app/lib/api/llm/health/keys";
import { readEndpointWindow } from "@app/lib/api/llm/health/window";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { beforeEach, describe, expect, it } from "vitest";

const ENDPOINT = {
  modelId: "claude-sonnet-5",
  providerId: "anthropic",
  host: "anthropic",
} as const;

const OTHER_HOST = { ...ENDPOINT, host: "agent-platform" } as const;

const NOW = new Date("2026-09-03T14:32:10Z");

// Writes counters the way another pod would: additively, through the client.
async function seed(
  endpoint: typeof ENDPOINT | typeof OTHER_HOST,
  bucket: string,
  fields: Record<string, number>
): Promise<void> {
  const key = modelHealthKey(endpoint, bucket);
  for (const [field, value] of Object.entries(fields)) {
    await redisMock.cacheClient.hIncrBy(key, field, value);
  }
}

describe("readEndpointWindow", () => {
  beforeEach(() => {
    redisMock.reset();
  });

  it("sums the whole window including the current minute", async () => {
    for (const bucket of [
      "202609031428",
      "202609031429",
      "202609031430",
      "202609031431",
      "202609031432",
    ]) {
      await seed(ENDPOINT, bucket, {
        [ATTEMPTS_FIELD]: 50,
        [PROVIDER_ERRORS_FIELD]: 10,
      });
    }

    expect(await readEndpointWindow(ENDPOINT, NOW)).toEqual({
      attempts: 250,
      providerErrors: 50,
    });
  });

  it("leaves out minutes that fell out of the window", async () => {
    await seed(ENDPOINT, "202609031427", { [ATTEMPTS_FIELD]: 1000 });
    await seed(ENDPOINT, "202609031432", { [ATTEMPTS_FIELD]: 7 });

    expect((await readEndpointWindow(ENDPOINT, NOW)).attempts).toBe(7);
  });

  it("returns a zeroed window when no key exists", async () => {
    expect(await readEndpointWindow(ENDPOINT, NOW)).toEqual({
      attempts: 0,
      providerErrors: 0,
    });
  });

  it("keeps hosts serving the same model separate", async () => {
    await seed(ENDPOINT, "202609031432", { [ATTEMPTS_FIELD]: 3 });
    await seed(OTHER_HOST, "202609031432", { [ATTEMPTS_FIELD]: 11 });

    expect((await readEndpointWindow(ENDPOINT, NOW)).attempts).toBe(3);
    expect((await readEndpointWindow(OTHER_HOST, NOW)).attempts).toBe(11);
  });
});
