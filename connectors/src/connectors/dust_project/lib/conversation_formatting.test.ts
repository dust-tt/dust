import type { ConversationPublicType } from "@dust-tt/client";
import { describe, expect, it } from "vitest";

import {
  CONVERSATION_MESSAGES_PER_DOCUMENT,
  chunkMessageSectionsForDocuments,
  getConversationDocumentUpsertTitle,
} from "./conversation_formatting";

function minimalConversation(
  overrides: Partial<ConversationPublicType>
): ConversationPublicType {
  return {
    id: 1,
    created: 0,
    unread: false,
    actionRequired: false,
    owner: {} as ConversationPublicType["owner"],
    sId: "conv-1",
    title: "T",
    visibility: "workspace",
    content: [],
    url: "https://example.com/c",
    ...overrides,
  };
}

describe("chunkMessageSectionsForDocuments", () => {
  it("returns one empty chunk for no messages", () => {
    expect(chunkMessageSectionsForDocuments([])).toEqual([[]]);
  });

  it("keeps a single chunk when under the limit", () => {
    const sections = Array.from({ length: 10 }, (_, i) => ({
      prefix: `${i}`,
      content: "x",
      sections: [] as [],
    }));
    const chunks = chunkMessageSectionsForDocuments(sections);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(10);
  });

  it(`splits at ${CONVERSATION_MESSAGES_PER_DOCUMENT} messages`, () => {
    const n = CONVERSATION_MESSAGES_PER_DOCUMENT;
    const sections = Array.from({ length: n + 1 }, (_, i) => ({
      prefix: `${i}`,
      content: "x",
      sections: [] as [],
    }));
    const chunks = chunkMessageSectionsForDocuments(sections);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(n);
    expect(chunks[1]).toHaveLength(1);
  });
});

describe("getConversationDocumentUpsertTitle", () => {
  it("has no suffix for a single document", () => {
    const c = minimalConversation({ title: "Hello" });
    expect(getConversationDocumentUpsertTitle(c, 1, 1)).toBe("Hello");
  });

  it("adds part suffix when split into multiple documents", () => {
    const c = minimalConversation({ title: "Hello" });
    expect(getConversationDocumentUpsertTitle(c, 2, 5)).toBe(
      "Hello (part 2 of 5)"
    );
  });
});
