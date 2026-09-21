import { shouldPauseAgentLoopStream } from "@app/lib/client/agent_loop_stream";
import { describe, expect, it } from "vitest";

describe("shouldPauseAgentLoopStream", () => {
  it.each([
    "tool_approve_execution",
    "tool_personal_auth_required",
    "tool_file_auth_required",
    "tool_ask_user_question",
  ])("recognizes the final %s event", (type) => {
    expect(
      shouldPauseAgentLoopStream(
        JSON.stringify({
          eventId: "event-1",
          data: { type, isLastBlockingEventForStep: true },
        })
      )
    ).toBe(true);
  });

  it("ignores earlier blocking events and terminal errors", () => {
    expect(
      shouldPauseAgentLoopStream(
        JSON.stringify({
          data: {
            type: "tool_approve_execution",
            isLastBlockingEventForStep: false,
          },
        })
      )
    ).toBe(false);
    expect(
      shouldPauseAgentLoopStream(
        JSON.stringify({
          data: { type: "tool_error", isLastBlockingEventForStep: true },
        })
      )
    ).toBe(false);
    expect(shouldPauseAgentLoopStream("invalid json")).toBe(false);
  });
});
