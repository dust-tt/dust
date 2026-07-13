import { POD_MANAGER_TOOLS_METADATA } from "@app/lib/api/actions/servers/pod_manager/metadata";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { validatePodConversationMessageTarget } from "./index";

describe("validatePodConversationMessageTarget", () => {
  it("requires a target conversation in the tool schema", () => {
    const schema = z.object(
      POD_MANAGER_TOOLS_METADATA.add_message_to_conversation.schema
    );

    const jsonSchema = zodToJsonSchema(schema);

    if (!("required" in jsonSchema)) {
      throw new Error("Expected an object JSON schema");
    }
    expect(jsonSchema.required).toContain("conversationId");
  });

  it("rejects a missing target conversation", () => {
    const result = validatePodConversationMessageTarget({
      conversationId: undefined,
      currentConversationId: "conversation-current",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("conversationId is required");
    }
  });

  it("rejects the active conversation", () => {
    const result = validatePodConversationMessageTarget({
      conversationId: "conversation-current",
      currentConversationId: "conversation-current",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "cannot post to the active conversation"
      );
    }
  });

  it("accepts a different conversation", () => {
    const result = validatePodConversationMessageTarget({
      conversationId: "conversation-target",
      currentConversationId: "conversation-current",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("conversation-target");
    }
  });
});
