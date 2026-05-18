import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { generateSandboxExecToken } from "@app/lib/api/sandbox/access_tokens";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

process.env.DUST_SANDBOX_JWT_SECRET ??= "test-sandbox-jwt-secret";

export async function createSandboxTokenTestContext({
  enableSandboxTools = false,
  enableDsbxTools = false,
}: {
  enableSandboxTools?: boolean;
  enableDsbxTools?: boolean;
} = {}) {
  const user = await UserFactory.basic();
  const workspace = await WorkspaceFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const { globalSpace } = await SpaceFactory.defaults(auth);

  if (enableSandboxTools) {
    await FeatureFlagFactory.basic(auth, "sandbox_tools");
  }
  if (enableDsbxTools) {
    await FeatureFlagFactory.basic(auth, "sandbox_dsbx_tools");
  }

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
    requestedSpaceIds: [globalSpace.id],
  });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [new Date()],
    requestedSpaceIds: [globalSpace.id],
  });
  const sandbox = await SandboxFactory.create(auth, conversation);

  const conversationResult = await getConversation(auth, conversation.sId);
  if (conversationResult.isErr()) {
    throw conversationResult.error;
  }

  const agentMessage = conversationResult.value.content
    .flat()
    .find((message) => message.type === "agent_message");
  if (!agentMessage) {
    throw new Error("Expected sandbox token test conversation agent message.");
  }

  const token = await generateSandboxExecToken(auth, {
    agentConfiguration: agentConfig,
    agentMessage,
    conversation,
    sandbox,
    execId: `test-exec-${sandbox.sId}`,
  });

  return {
    auth,
    workspace,
    globalSpace,
    agentConfig,
    conversation,
    sandbox,
    agentMessage,
    token,
  };
}
