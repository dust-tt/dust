import type { Authenticator } from "@app/lib/auth";
import { buildConversationSearchDocument } from "@app/lib/conversation_search";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ConversationForkingDataType } from "@app/types/assistant/conversation";
import type { UserType } from "@app/types/user";
import { describe, expect, it } from "vitest";

const WORKSPACE_ID = "w_test";
const CONVERSATION_ID = "conv_test";
const CREATED_AT = new Date("2026-05-05T10:00:00.000Z");
const UPDATED_AT = new Date("2026-05-05T11:00:00.000Z");

const FORKING_USER: UserType = {
  createdAt: CREATED_AT.getTime(),
  email: "forker@example.com",
  firstName: "Fork",
  fullName: "Fork User",
  id: 1,
  image: null,
  lastLoginAt: null,
  lastName: "User",
  provider: null,
  sId: "user_forker",
  username: "forker",
};

function makeAuth(): Authenticator {
  return {
    getNonNullableWorkspace: () => ({ sId: WORKSPACE_ID }),
  } as Authenticator;
}

function makeForkingData(
  parentConversationTitle: string | null
): ConversationForkingDataType {
  return {
    forkedFrom: {
      branchedAt: CREATED_AT.getTime(),
      parentConversationId: "conv_parent",
      parentConversationTitle,
      sourceMessageId: "msg_source",
      user: FORKING_USER,
    },
  };
}

function makeConversation({
  forkingData,
  title,
}: {
  forkingData?: ConversationForkingDataType;
  title: string | null;
}): ConversationResource {
  return {
    createdAt: CREATED_AT,
    forkingData,
    getRequestedSpaceIdsFromModel: () => [],
    hasError: false,
    metadata: {},
    sId: CONVERSATION_ID,
    space: null,
    title,
    triggerSId: null,
    updatedAt: UPDATED_AT,
    visibility: "unlisted",
  } as unknown as ConversationResource;
}

describe("buildConversationSearchDocument", () => {
  it("keeps a persisted title on forked conversations", () => {
    const document = buildConversationSearchDocument(
      makeAuth(),
      makeConversation({
        forkingData: makeForkingData("Parent conversation"),
        title: "Child title",
      }),
      []
    );

    expect(document.title).toBe("Child title");
  });

  it("keeps untitled non-fork conversations null", () => {
    const document = buildConversationSearchDocument(
      makeAuth(),
      makeConversation({ title: null }),
      []
    );

    expect(document.title).toBeNull();
  });

  it("stores the parent title fallback for untitled forked conversations", () => {
    const document = buildConversationSearchDocument(
      makeAuth(),
      makeConversation({
        forkingData: makeForkingData("Parent conversation"),
        title: null,
      }),
      []
    );

    expect(document.title).toBe("Branched from 'Parent conversation'");
  });

  it("stores the generic fork fallback when the parent title is unavailable", () => {
    const document = buildConversationSearchDocument(
      makeAuth(),
      makeConversation({
        forkingData: makeForkingData(null),
        title: null,
      }),
      []
    );

    expect(document.title).toBe("Branched conversation");
  });
});
