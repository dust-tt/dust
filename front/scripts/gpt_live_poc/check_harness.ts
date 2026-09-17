import { setTimeout } from "node:timers/promises";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import {
  isAgentMessageType,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
import { isDevelopment } from "@app/types/shared/env";

makeScript(
  {
    workspaceId: { type: "string", default: "DevWkSpace" },
    userEmail: { type: "string", demandOption: true },
    agentId: { type: "string", default: "dust" },
  },
  async ({ workspaceId, userEmail, agentId, execute }, logger) => {
    if (!isDevelopment()) {
      throw new Error("This POC smoke test must run in development.");
    }
    if (!execute) {
      logger.info(
        {},
        "Would create a local conversation and exercise the normal agent tool loop."
      );
      return;
    }
    const user = await UserResource.fetchByEmail(userEmail);
    if (!user) {
      throw new Error("Local test user not found.");
    }
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspaceId
    );
    if (!auth.isAdmin()) {
      throw new Error("Use a local workspace admin.");
    }
    const groups = await GroupResource.makeDefaultsForWorkspace(
      auth.getNonNullableWorkspace()
    );
    await SpaceResource.makeDefaultsForWorkspace(auth, groups);
    await auth.refresh();
    await FeatureFlagResource.enable(
      auth.getNonNullableWorkspace(),
      "gpt_live"
    );
    const conversation = await createConversation(auth, {
      title: "GPT-Live POC: tool smoke test",
      visibility: "unlisted",
      spaceId: null,
    });
    logger.info(
      { conversationId: conversation.sId },
      "Created POC conversation"
    );
    const result = await postUserMessage(auth, {
      conversationResource: conversation,
      content:
        "Use the math_operation tool to calculate 17 * 23. You must call the tool, then give the result in one short sentence.",
      mentions: [{ configurationId: agentId }],
      context: {
        timezone: "Europe/Paris",
        username: user.username,
        fullName: user.fullName(),
        email: user.email,
        profilePictureUrl: user.imageUrl,
        origin: "web",
        clientSideMCPServerIds: [],
        selectedSpaceIds: [],
      },
      skipToolsValidation: false,
    });
    if (result.isErr()) {
      throw new Error(JSON.stringify(result.error));
    }
    const messageId = result.value.agentMessages[0]?.sId;
    if (!messageId) {
      throw new Error("No agent response was started.");
    }
    logger.info({ messageId }, "Agent loop started");
    const deadlineMs = Date.now() + 120_000;
    while (Date.now() < deadlineMs) {
      const row = await conversation.getMessageById(auth, messageId);
      if (row.isErr()) {
        throw row.error;
      }
      const state = await batchRenderMessages(
        auth,
        conversation,
        [row.value],
        "full",
        null
      );
      if (state.isErr()) {
        throw state.error;
      }
      const message = state.value[0];
      if (
        message &&
        isAgentMessageType(message) &&
        isTerminalAgentMessageStatus(message.status)
      ) {
        logger.info(
          {
            messageStatus: message.status,
            content: message.content,
            tools: message.actions.map((action) => ({
              name: action.functionCallName,
              status: action.status,
            })),
          },
          "Harness result"
        );
        if (
          message.status !== "succeeded" ||
          !message.actions.some((action) => action.status === "succeeded")
        ) {
          throw new Error("The real agent/tool run did not succeed.");
        }
        return;
      }
      await setTimeout(1_000);
    }
    throw new Error("Timed out waiting for the Dust agent loop.");
  }
);
