import {
  getAgentMessageHeaderTimestampMs,
  getLatestHandoffDescendantCompletedTs,
} from "@app/components/assistant/conversation/agentMessageTiming";
import { describe, expect, it } from "vitest";

const PARENT_CREATED = 1_000;
const PARENT_COMPLETED = 1_000 + (4 * 60 + 54) * 1000;
const CHILD_COMPLETED = 1_000 + 15 * 60 * 1000;

describe("getLatestHandoffDescendantCompletedTs", () => {
  it("returns null when there is no handoff child", () => {
    expect(
      getLatestHandoffDescendantCompletedTs("parent", [
        {
          sId: "parent",
          parentAgentMessageId: null,
          completedTs: PARENT_COMPLETED,
        },
      ])
    ).toBeNull();
  });

  it("returns the child's completedTs", () => {
    expect(
      getLatestHandoffDescendantCompletedTs("parent", [
        {
          sId: "parent",
          parentAgentMessageId: null,
          completedTs: PARENT_COMPLETED,
        },
        {
          sId: "child",
          parentAgentMessageId: "parent",
          completedTs: CHILD_COMPLETED,
        },
      ])
    ).toBe(CHILD_COMPLETED);
  });

  it("walks nested handoffs to the latest descendant", () => {
    const grandchildCompleted = CHILD_COMPLETED + 60_000;
    expect(
      getLatestHandoffDescendantCompletedTs("parent", [
        {
          sId: "parent",
          parentAgentMessageId: null,
          completedTs: PARENT_COMPLETED,
        },
        {
          sId: "child",
          parentAgentMessageId: "parent",
          completedTs: CHILD_COMPLETED,
        },
        {
          sId: "grandchild",
          parentAgentMessageId: "child",
          completedTs: grandchildCompleted,
        },
      ])
    ).toBe(grandchildCompleted);
  });
});

describe("getAgentMessageHeaderTimestampMs", () => {
  const parent = {
    created: PARENT_CREATED,
    completedTs: PARENT_COMPLETED,
    messageId: "parent",
  };

  it("uses completedTs for a regular agent message", () => {
    expect(
      getAgentMessageHeaderTimestampMs({
        ...parent,
        parentAgentVisible: false,
        messages: [],
      })
    ).toBe(PARENT_COMPLETED);
  });

  it("hides the timestamp on a visible handoff child", () => {
    expect(
      getAgentMessageHeaderTimestampMs({
        created: PARENT_COMPLETED,
        completedTs: CHILD_COMPLETED,
        messageId: "child",
        parentAgentVisible: true,
        messages: [],
      })
    ).toBeUndefined();
  });

  it("keeps the parent's time while the handoff child is still running", () => {
    expect(
      getAgentMessageHeaderTimestampMs({
        ...parent,
        parentAgentVisible: false,
        messages: [
          {
            sId: "child",
            parentAgentMessageId: "parent",
            completedTs: null,
          },
        ],
      })
    ).toBe(PARENT_COMPLETED);
  });

  it("uses the child's completed time after a handoff", () => {
    expect(
      getAgentMessageHeaderTimestampMs({
        ...parent,
        parentAgentVisible: false,
        messages: [
          {
            sId: "child",
            parentAgentMessageId: "parent",
            completedTs: CHILD_COMPLETED,
          },
        ],
      })
    ).toBe(CHILD_COMPLETED);
  });
});
