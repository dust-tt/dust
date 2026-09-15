import {
  isModelEndpointAutomaticallyDegraded,
  markModelAutomaticallyDegraded,
} from "@app/lib/api/llm/health/automatic_degradation";
import { logModelHealthTransition } from "@app/lib/api/llm/health/transitions";
import {
  logModelHealthProbeFailedActivity,
  logModelHealthRecoveryActivity,
} from "@app/temporal/model_health/activities";
import { redisMock } from "@app/tests/utils/mocks/redis";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/llm/health/transitions", () => ({
  logModelHealthTransition: vi.fn(),
}));

const ENDPOINT = {
  modelId: "gpt-5.4-mini",
  providerId: "openai",
  host: "openai-responses",
} as const;

describe("model health recovery activities", () => {
  afterEach(() => {
    redisMock.reset();
    vi.clearAllMocks();
  });

  it("renews automatic degradation after a failed probe", async () => {
    await markModelAutomaticallyDegraded(ENDPOINT, 1);

    await logModelHealthProbeFailedActivity({
      endpoint: ENDPOINT,
      degradedForMs: 10,
    });

    expect(await isModelEndpointAutomaticallyDegraded(ENDPOINT)).toBe(true);
    expect(logModelHealthTransition).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      transition: "probe_failed",
      degradedForMs: 10,
    });
  });

  it("clears automatic degradation after recovery", async () => {
    await markModelAutomaticallyDegraded(ENDPOINT);

    await logModelHealthRecoveryActivity({
      endpoint: ENDPOINT,
      degradedForMs: 10,
    });

    expect(await isModelEndpointAutomaticallyDegraded(ENDPOINT)).toBe(false);
    expect(logModelHealthTransition).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      transition: "recovered",
      degradedForMs: 10,
    });
  });
});
