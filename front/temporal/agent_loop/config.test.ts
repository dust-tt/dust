import {
  BATCH_QUEUE_NAME,
  getQueueForUserMessageOrigin,
  getQueueName,
  INTERACTIVE_QUEUE_NAME,
  PROGRAMMATIC_QUEUE_NAME,
  SCHEDULES_QUEUE_NAME,
} from "@app/temporal/agent_loop/config";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

describe("getQueueName", () => {
  it("maps each queue to its task queue name", () => {
    expect(getQueueName("schedules")).toBe(SCHEDULES_QUEUE_NAME);
    expect(getQueueName("interactive")).toBe(INTERACTIVE_QUEUE_NAME);
    expect(getQueueName("programmatic")).toBe(PROGRAMMATIC_QUEUE_NAME);
    expect(getQueueName("batch")).toBe(BATCH_QUEUE_NAME);
  });
});

describe("getQueueForUserMessageOrigin", () => {
  it("routes product UI origins to the interactive queue", () => {
    const origins: UserMessageOrigin[] = [
      "web",
      "agent_sidekick",
      "project_kickoff",
    ];
    for (const origin of origins) {
      expect(getQueueForUserMessageOrigin(origin)).toBe("interactive");
    }
  });

  it("routes public API origins to the programmatic queue", () => {
    const origins: UserMessageOrigin[] = [
      "api",
      "zapier",
      "extension",
      "gsheet",
      "zendesk",
    ];
    for (const origin of origins) {
      expect(getQueueForUserMessageOrigin(origin)).toBe("programmatic");
    }
  });

  it("routes chat platform bot origins to the interactive queue", () => {
    const origins: UserMessageOrigin[] = ["slack", "slack_workflow", "teams"];
    for (const origin of origins) {
      expect(getQueueForUserMessageOrigin(origin)).toBe("interactive");
    }
  });

  it("routes scheduled triggers and wake-ups to the schedules queue", () => {
    expect(getQueueForUserMessageOrigin("triggered")).toBe("schedules");
    expect(getQueueForUserMessageOrigin("wakeup")).toBe("schedules");
  });

  it("routes webhook triggers and internal batch origins to the batch queue", () => {
    expect(getQueueForUserMessageOrigin("triggered_programmatic")).toBe(
      "batch"
    );
    expect(getQueueForUserMessageOrigin("reinforcement")).toBe("batch");
    expect(getQueueForUserMessageOrigin("system_activation")).toBe("batch");
    expect(getQueueForUserMessageOrigin("transcript")).toBe("batch");
  });
});
