import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

import handler from "./index";

function makeMessageBody({
  content,
  mentions = [],
}: {
  content: string;
  mentions?: { configurationId: string }[];
}) {
  return {
    content,
    mentions,
    context: {
      timezone: "UTC",
      profilePictureUrl: null,
    },
  };
}

describe("POST /api/w/[wId]/assistant/conversations/[cId]/messages", () => {
  it("rejects empty content without steering", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "POST",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    req.query.cId = conversation.sId;
    req.body = makeMessageBody({ content: "" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toBe(
      "Message content cannot be empty."
    );
  });

  it("rejects empty content with steering but no mentions", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "POST",
    });

    await FeatureFlagFactory.basic(auth, "enable_steering");

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    req.query.cId = conversation.sId;
    req.body = makeMessageBody({ content: "", mentions: [] });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toBe(
      "Message content cannot be empty unless at least one mention is provided."
    );
  });

  it("allows empty content with steering and a mention", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "POST",
    });

    await FeatureFlagFactory.basic(auth, "enable_steering");

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    req.query.cId = conversation.sId;
    req.body = makeMessageBody({
      content: "",
      mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("allows non-empty content without steering", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "POST",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    req.query.cId = conversation.sId;
    req.body = makeMessageBody({
      content: "Hello",
      mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });
});
