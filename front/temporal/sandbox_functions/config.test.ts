import {
  LEGACY_QUEUE_NAME,
  QUEUE_NAME,
} from "@app/temporal/sandbox_functions/config";
import { describe, expect, it } from "vitest";

describe("sandbox function queues", () => {
  it("moves new workflows to a new queue while preserving the previous queue", () => {
    expect(QUEUE_NAME).toBe("sandbox-functions-queue-v2");
    expect(LEGACY_QUEUE_NAME).toBe("sandbox-functions-queue-v1");
  });
});
