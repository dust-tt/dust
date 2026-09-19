import { isLastBlockingAgentLoopEvent } from "@app/lib/client/agent_loop_stream";
import { describe, expect, it } from "vitest";

describe("isLastBlockingAgentLoopEvent", () => {
  it.each([
    "tool_approve_execution",
    "tool_personal_auth_required",
    "tool_file_auth_required",
    "tool_ask_user_question",
  ])("recognizes the final %s event", (type) => {
    expect(
      isLastBlockingAgentLoopEvent(
        JSON.stringify({
          eventId: "event-1",
          data: { type, isLastBlockingEventForStep: true },
        })
      )
    ).toBe(true);
  });

  it("ignores earlier blocking events and terminal errors", () => {
    expect(
      isLastBlockingAgentLoopEvent(
        JSON.stringify({
          data: {
            type: "tool_approve_execution",
            isLastBlockingEventForStep: false,
          },
        })
      )
    ).toBe(false);
    expect(
      isLastBlockingAgentLoopEvent(
        JSON.stringify({
          data: { type: "tool_error", isLastBlockingEventForStep: true },
        })
      )
    ).toBe(false);
    expect(isLastBlockingAgentLoopEvent("invalid json")).toBe(false);
  });
});
