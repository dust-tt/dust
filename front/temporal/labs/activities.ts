import type { AgentMessageType, ModelId } from "@dust-tt/types";
import {
  assertNever,
  DustAPI,
  isEmptyString,
  minTranscriptsSize,
} from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import marked from "marked";
import sanitizeHtml from "sanitize-html";

import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { sendEmail } from "@app/lib/email";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import mainLogger from "@app/logger/logger";
import {
  retrieveGongTranscriptContent,
  retrieveGongTranscripts,
} from "@app/temporal/labs/utils/gong";
import {
  retrieveGoogleTranscriptContent,
  retrieveGoogleTranscripts,
} from "@app/temporal/labs/utils/google";

export async function retrieveNewTranscriptsActivity(
  transcriptsConfigurationId: ModelId
): Promise<string[]> {
  const localLogger = mainLogger.child({
    transcriptsConfigurationId,
  });

  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.fetchByModelId(
      transcriptsConfigurationId
    );

  if (!transcriptsConfiguration) {
    localLogger.error(
      {},
      "[retrieveNewTranscripts] Transcript configuration not found. Skipping."
    );
    return [];
  }

  const workspace = await Workspace.findOne({
    where: {
      id: transcriptsConfiguration.workspaceId,
    },
  });

  if (!workspace) {
    throw new Error(
      `Could not find workspace for user (workspaceId: ${transcriptsConfiguration.workspaceId}).`
    );
  }

  const auth = await Authenticator.internalBuilderForWorkspace(workspace.sId);

  if (!auth.workspace()) {
    localLogger.error(
      {},
      "[retrieveNewTranscripts] Workspace not found. Stopping."
    );
    return [];
  }

  const transcriptsIdsToProcess: string[] = [];

  switch (transcriptsConfiguration.provider) {
    case "google_drive":
      const googleTranscriptsIds = await retrieveGoogleTranscripts(
        auth,
        transcriptsConfiguration,
        localLogger
      );
      transcriptsIdsToProcess.push(...googleTranscriptsIds);
      break;

    case "gong":
      const gongTranscriptsIds = await retrieveGongTranscripts(
        auth,
        transcriptsConfiguration,
        localLogger
      );
      transcriptsIdsToProcess.push(...gongTranscriptsIds);
      break;

    default:
      assertNever(transcriptsConfiguration.provider);
  }

  return transcriptsIdsToProcess;
}

export async function processTranscriptActivity(
  transcriptsConfigurationId: ModelId,
  fileId: string
) {
  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.fetchByModelId(
      transcriptsConfigurationId
    );

  if (!transcriptsConfiguration) {
    throw new Error(
      `Could not find transcript configuration for id ${transcriptsConfigurationId}.`
    );
  }

  const workspace = await Workspace.findOne({
    where: {
      id: transcriptsConfiguration.workspaceId,
    },
  });

  if (!workspace) {
    throw new Error(
      `Could not find workspace for user (workspaceId: ${transcriptsConfiguration.workspaceId}).`
    );
  }

  const auth = await Authenticator.internalBuilderForWorkspace(workspace.sId);

  if (!auth.workspace()) {
    throw new Error(
      `Could not find workspace for user (workspaceId: ${transcriptsConfiguration.workspaceId}).`
    );
  }

  const user = await UserResource.fetchByModelId(transcriptsConfiguration.userId);

  if (!user) {
    throw new Error(`Could not find user for id ${transcriptsConfiguration.userId}.`);
  }

  const localLogger = mainLogger.child({
    userId: user.id,
    fileId,
    transcriptsConfigurationId,
  });

  localLogger.info(
    {},
    "[processTranscriptActivity] Starting processing of file."
  );

  const hasExistingHistory =
    await transcriptsConfiguration.fetchHistoryForFileId(fileId);
  if (hasExistingHistory) {
    localLogger.info(
      {},
      "[processTranscriptActivity] History record already exists. Stopping."
    );
    return;
  }

  let transcriptTitle = "";
  let transcriptContent = "";

  switch (transcriptsConfiguration.provider) {
    case "google_drive":
      const googleResult = await retrieveGoogleTranscriptContent(
        auth,
        transcriptsConfiguration,
        fileId,
        localLogger
      );
      transcriptTitle = googleResult.transcriptTitle;
      transcriptContent = googleResult.transcriptContent;
      break;

    case "gong":
      const gongResult = await retrieveGongTranscriptContent(
        auth,
        transcriptsConfiguration,
        fileId,
        localLogger
      );
      transcriptTitle = gongResult?.transcriptTitle || "";
      transcriptContent = gongResult?.transcriptContent || "";
      break;

    default:
      assertNever(transcriptsConfiguration.provider);
  }

  // Short transcripts are likely not useful to process.
  if (transcriptContent.length < minTranscriptsSize) {
    localLogger.info(
      {},
      "[processTranscriptActivity] Transcript content too short or empty. Skipping."
    );
    await transcriptsConfiguration.recordHistory({
      configurationId: transcriptsConfiguration.id,
      fileId,
      fileName: transcriptTitle,
      conversationId: null,
    });
    return;
  }

  const owner = auth.workspace();

  if (!owner) {
    localLogger.error(
      {},
      "[processTranscriptActivity] No owner found. Stopping."
    );
    return;
  }

  const { agentConfigurationId } = transcriptsConfiguration;
  if (!agentConfigurationId) {
    localLogger.error(
      {},
      "[processTranscriptActivity] No agent configuration id found. Stopping."
    );
    return;
  }

  const agentConfigurations = await getAgentConfigurations({
    auth,
    agentsGetView: "all",
    variant: "light",
    sort: undefined,
  });
  const agent = agentConfigurations.find(
    (agent) => agent.sId === agentConfigurationId
  );

  if (!agent) {
    localLogger.error(
      {
        agentConfigurationId,
      },
      "[processTranscriptActivity] No agent found. Stopping."
    );
    return;
  }

  if (isEmptyString(user.username)) {
    return new Err(new Error("username must be a non-empty string"));
  }

  console.warn("CREATING CONVERSATION WITH MESSAGE")

  const conversationRes = await createConversationWithMessage({
    owner,
    user: user.toJSON(),
    messageData: {
      input: transcriptContent,
      mentions: [{ configurationId: agentConfigurationId }],
      contentFragments: [],
    },
    visibility: "workspace",
    title: transcriptTitle,
  });

  if (conversationRes.isErr()) {
    localLogger.error(
      { agentConfigurationId, error: conversationRes.error },
      "[processTranscriptActivity] Error creating conversation."
    );
    return new Err(new Error(conversationRes.error.message));
  }

  const conversation = conversationRes.value;
  if (!conversation) {
    localLogger.error(
      {
        agentConfigurationId,
      },
      "[processTranscriptActivity] No conversation found. Stopping."
    );
    return;
  }

  localLogger.info(
    {
      agentConfigurationId,
      conservationSid: conversation.sId,
    },
    "[processTranscriptActivity] Created conversation."
  );

  // Get first from array with type='agent_message' in conversation.content;
  const agentMessage = <AgentMessageType[]>conversation.content.find(
    (innerArray) => {
      return innerArray.find((item) => item.type === "agent_message");
    }
  );
  const markDownAnswer =
    agentMessage && agentMessage[0].content ? agentMessage[0].content : "";
  const htmlAnswer = sanitizeHtml(await marked.parse(markDownAnswer), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]), // Allow images on top of all defaults from https://www.npmjs.com/package/sanitize-html
  });

  await transcriptsConfiguration.recordHistory({
    configurationId: transcriptsConfiguration.id,
    fileId,
    fileName: transcriptTitle,
    conversationId: conversation.sId,
  });

  const msg = {
    from: {
      name: "Dust team",
      email: "team@dust.help",
    },
    subject: `[DUST] Meeting summary - ${transcriptTitle}`,
    html: `<a href="https://dust.tt/w/${owner.sId}/assistant/${conversation.sId}">Open this conversation in Dust</a><br /><br /> ${htmlAnswer}<br /><br />The team at <a href="https://dust.tt">Dust.tt</a>`,
  };

  await sendEmail(user.email, msg);
}
