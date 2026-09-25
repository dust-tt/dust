import { getCurrentAnswerScrollLocation } from "@app/components/assistant/conversation/input_bar/getCurrentAnswerScrollLocation";
import { describe, expect, it } from "vitest";

describe("getCurrentAnswerScrollLocation", () => {
  it("aligns the newest tokens of the active answer with the viewport", () => {
    const messages = [
      { sId: "user", type: "user_message" },
      { sId: "active", type: "agent_message", status: "created" },
      { sId: "steering", type: "user_message" },
    ];

    expect(getCurrentAnswerScrollLocation(messages, "active")).toEqual({
      index: 1,
      align: "end",
      behavior: "instant",
    });
  });

  it("finds a running answer when its ID has not reached the navigation yet", () => {
    const messages = [
      { sId: "older", type: "agent_message", status: "succeeded" },
      { sId: "active", type: "agent_message", status: "created" },
    ];

    expect(getCurrentAnswerScrollLocation(messages, "pending")).toEqual({
      index: 1,
      align: "end",
      behavior: "instant",
    });
  });
});
