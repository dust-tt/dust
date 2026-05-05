import {
  getCompactionInProgressLabel,
  getCompactionSuccessLabel,
  getParentConversationTitleLabel,
} from "@app/components/assistant/conversation/utils";
import type {
  CompactionMessageType,
  ConversationForkedFromType,
} from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

const CONVERSATION_CREATED_AT = new Date("2026-05-05T12:00:00Z").getTime();

function makeCompactionMessage(
  sourceConversationId: string | null
): CompactionMessageType {
  return {
    type: "compaction_message",
    id: 1,
    compactionMessageId: 2,
    sId: "msg_1",
    created: CONVERSATION_CREATED_AT,
    visibility: "visible",
    version: 1,
    rank: 0,
    branchId: null,
    sourceConversationId,
    status: "created",
    content: null,
  };
}

function makeForkedFrom(
  parentConversationTitle: string | null
): ConversationForkedFromType {
  return {
    parentConversationId: "conv_parent",
    parentConversationTitle,
    sourceMessageId: "msg_source",
    branchedAt: CONVERSATION_CREATED_AT,
    user: {
      sId: "user_1",
      id: 1,
      createdAt: CONVERSATION_CREATED_AT,
      provider: null,
      username: "forker",
      email: "forker@example.com",
      firstName: "Fork",
      lastName: null,
      fullName: "Fork User",
      image: null,
      lastLoginAt: null,
    },
  };
}

describe("conversation branching labels", () => {
  it("uses the shared fallback for untitled parent conversations", () => {
    expect(getParentConversationTitleLabel(makeForkedFrom(null))).toBe(
      "Unnamed parent conversation"
    );
  });

  it("labels parent conversation compaction while it is running", () => {
    const forkedFrom = makeForkedFrom("Quarterly review");

    expect(
      getCompactionInProgressLabel(makeCompactionMessage("conv_parent"), {
        sId: "conv_child",
        forkingData: { forkedFrom },
      })
    ).toBe("Summarizing 'Quarterly review', this may take a moment…");
  });

  it("uses the shared parent title fallback for compaction labels", () => {
    const forkedFrom = makeForkedFrom(null);

    expect(
      getCompactionInProgressLabel(makeCompactionMessage("conv_parent"), {
        sId: "conv_child",
        forkingData: { forkedFrom },
      })
    ).toBe(
      "Summarizing 'Unnamed parent conversation', this may take a moment…"
    );
    expect(
      getCompactionSuccessLabel(makeCompactionMessage("conv_parent"), {
        sId: "conv_child",
        forkingData: { forkedFrom },
      })
    ).toBe("Summarized 'Unnamed parent conversation' here");
  });
});
