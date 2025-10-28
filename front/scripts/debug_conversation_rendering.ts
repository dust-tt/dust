import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import { getRunAgentData } from "@app/types/assistant/agent_run";

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "Workspace ID",
    },
    runAgentArgs: {
      type: "string",
      demandOption: true,
      description: "Run agent args",
    },
    step: {
      type: "number",
      demandOption: true,
      description: "Step number",
    },
  },
  async ({ runAgentArgs, step, workspaceId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);

    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    logger.info({ runAgentArgs }, "About to get run agent data");

    const runAgentData = await getRunAgentData(
      auth.toJSON(),
      JSON.parse(runAgentArgs)
    );

    logger.info({ runAgentData }, "Got run agent data");

    if (runAgentData.isErr()) {
      logger.error(
        { runAgentArgs, error: runAgentData.error },
        "Error getting run agent data"
      );
      return;
    }

    const {
      agentConfiguration,
      conversation: originalConversation,
      userMessage,
      agentMessage: originalAgentMessage,
      agentMessageRow,
    } = runAgentData.value;

    const {
      slicedConversation: conversation,
      slicedAgentMessage: agentMessage,
    } = sliceConversationForAgentMessage(originalConversation, {
      agentMessageId: originalAgentMessage.sId,
      agentMessageVersion: originalAgentMessage.version,
      step,
    });

    // console.log(">>conversation:", JSON.stringify(conversation, null, 2));
    // console.log(agentMessage);

    const model = getSupportedModelConfig(agentConfiguration.model);

    const prompt = await constructPromptMultiActions(auth, {
      userMessage,
      agentConfiguration,
      fallbackPrompt: "You are a conversational agent",
      model,
      hasAvailableActions: agentConfiguration.actions.length > 0,
      errorContext: "No error context",
      agentsList: null,
      conversationId: conversation.sId,
      serverToolsAndInstructions: [],
    });

    const modelConversationRes = await renderConversationForModel(auth, {
      conversation,
      model: {
        ...model,
        contextSize: 1000000,
        generationTokensCount: 0,
      },
      prompt,
      tools: "",
      allowedTokenCount: model.contextSize - model.generationTokensCount,
    });

    if (modelConversationRes.isErr()) {
      logger.error(
        { error: modelConversationRes.error },
        "Error rendering conversation for model"
      );
      return;
    }

    console.log(
      "modelConversationRes",
      JSON.stringify(modelConversationRes.value, null, 2)
    );
  }
);
