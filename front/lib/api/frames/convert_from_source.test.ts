import { convertLegacyFrameToV2 } from "@app/lib/api/frames/convert_from_source";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("convertLegacyFrameToV2", () => {
  it("rejects conversion across source owners", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });

    const result = await convertLegacyFrameToV2(auth, {
      conversation,
      sourcePath: "conversation-source/Legacy.tsx",
      manifestPath: "conversation-target/Status/manifest.json",
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
      message:
        "The legacy entry and v2 manifest must belong to the same conversation or Pod mount.",
    });
  });
});
