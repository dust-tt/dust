import { LiveTaskRelay } from "@app/lib/client/live_task";
import { describe, expect, it } from "vitest";

function frame(eventId: string, data: object) {
  return JSON.stringify({
    eventId,
    data: { messageId: "message", step: 0, ...data },
  });
}

function tokens(eventId: string, text: string, extra: object = {}) {
  return frame(eventId, {
    type: "generation_tokens",
    classification: "tokens",
    text,
    traceId: "first",
    ...extra,
  });
}

describe("live task updates", () => {
  it("speaks complete public sentences before the run ends, without repeating the final answer", () => {
    const relay = new LiveTaskRelay("message");
    expect(relay.receive(tokens("1", "The first result is"))).toEqual([]);
    expect(
      relay.receive(tokens("2", " 391. I am checking the next one"))
    ).toEqual([
      {
        type: "session.commentary.append",
        content: "The first result is 391.",
      },
    ]);
    expect(
      relay.complete("The first result is 391. I am checking the next one.")
    ).toEqual([
      {
        type: "session.commentary.append",
        content: " I am checking the next one.",
      },
    ]);
    expect(
      relay.complete("The first result is 391. I am checking the next one.")
    ).toEqual([]);
    // Polling can finish before the last queued SSE frames are delivered.
    expect(
      relay.receive(tokens("3", " 391. I am checking the next one."))
    ).toEqual([]);
  });

  it("ignores private reasoning and relays tool state without raw arguments or outputs", () => {
    const relay = new LiveTaskRelay("message");
    expect(
      relay.receive(
        tokens("1", "Private reasoning", { classification: "chain_of_thought" })
      )
    ).toEqual([]);
    const event = frame("2", {
      type: "agent_action_success",
      action: {
        sId: "tool",
        status: "succeeded",
        toolName: "search",
        params: { query: "private input" },
        output: [{ type: "text", text: "private output" }],
        displayLabels: { running: "Searching", done: "Found results" },
      },
    });
    expect(relay.receive(event)).toEqual([
      {
        type: "session.thinking.append",
        content: "Tool finished (succeeded): Found results.",
        status: "Found results",
      },
    ]);
    expect(relay.receive(event)).toEqual([]);
    expect(
      relay.receive(
        frame("3", {
          type: "generation_tokens",
          classification: "tokens",
          text: "Wrong conversation. ",
          messageId: "other",
        })
      )
    ).toEqual([]);
  });

  it("deduplicates reconnects and generation retries and announces a corrected result", () => {
    const relay = new LiveTaskRelay("message");
    const first = tokens("1", "Result is 391. ");
    expect(relay.receive(first)).toHaveLength(1);
    expect(relay.receive(first)).toEqual([]);
    expect(
      relay.receive(tokens("2", "Result is ", { traceId: "retry" }))
    ).toEqual([]);
    expect(
      relay.receive(
        tokens("3", "391. Next result is 42. ", { traceId: "retry" })
      )
    ).toEqual([
      { type: "session.commentary.append", content: " Next result is 42." },
    ]);
    expect(relay.complete("Result is 391. Next result is 43.")).toEqual([
      {
        type: "session.commentary.append",
        content: "Correction: Result is 391. Next result is 43.",
      },
    ]);
  });

  it("flushes between tool steps and recovers the final answer if streaming was missed", () => {
    const relay = new LiveTaskRelay("message");
    relay.receive(tokens("1", "I found the first document"));
    expect(
      relay.receive(
        tokens("2", "The other document confirms it. ", { step: 1 })
      )
    ).toEqual([
      {
        type: "session.commentary.append",
        content: "I found the first document",
      },
      {
        type: "session.commentary.append",
        content: "The other document confirms it.",
      },
    ]);
    expect(new LiveTaskRelay("message").complete("The answer is 391.")).toEqual(
      [{ type: "session.commentary.append", content: "The answer is 391." }]
    );
  });
});
