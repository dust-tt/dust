import type { AgentMessageType, ModelId } from "@dust-tt/types";
import { assertNever, DustAPI, minTranscriptsSize } from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import { isRight } from "fp-ts/lib/Either";
import { NonEmptyString } from "io-ts-types";
import marked from "marked";
import sanitizeHtml from "sanitize-html";

import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { sendEmail } from "@app/lib/email";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
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
    await LabsTranscriptsConfigurationResource.fetchById(
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
    await LabsTranscriptsConfigurationResource.fetchById(
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

  const localLogger = mainLogger.child({
    fileId,
    transcriptsConfigurationId,
  });

  const user = await User.findByPk(transcriptsConfiguration.userId);
  if (!user) {
    localLogger.error(
      {},
      "[processTranscriptActivity] User not found. Stopping."
    );
    return;
  }

  localLogger.info(
    {},
    "[processTranscriptActivity] Starting processing of file "
  );

  const hasExistingHistory =
    await transcriptsConfiguration.fetchHistoryForFileId(fileId);
  if (hasExistingHistory) {
    localLogger.info(
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
    localLogger.error("[processTranscriptActivity] No owner found. Stopping.");
    return;
  }

  const prodCredentials = await prodAPICredentialsForOwner(
    renderLightWorkspaceType({ workspace: owner }),
    { useLocalInDev: true }
  );
  const dustAPI = new DustAPI(prodCredentials, localLogger, {
    useLocalInDev: true,
  });

  const { agentConfigurationId } = transcriptsConfiguration;
  if (!agentConfigurationId) {
    localLogger.error(
      "[processTranscriptActivity] No agent configuration id found. Stopping."
    );
    return;
  }

  const agentConfigurationsRes = await dustAPI.getAgentConfigurations();
  if (agentConfigurationsRes.isErr()) {
    return new Err(new Error(agentConfigurationsRes.error.message));
  }

  const agentConfigurations = agentConfigurationsRes.value;
  const agent = agentConfigurations.find(
    (agent) => agent.sId === agentConfigurationId
  );

  if (!agent) {
    localLogger.error("[processTranscriptActivity] No agent found. Stopping.");
    return;
  }

  const toNonEmptyString = (str: string): NonEmptyString | null => {
    const result = NonEmptyString.decode(str);
    return isRight(result) ? result.right : null;
  };
  const nonEmptyUsername = toNonEmptyString(user.username);
  if (!nonEmptyUsername) {
    return new Err(new Error("username must be a non-empty string"));
  }
  const convRes = await dustAPI.createConversation({
    title: transcriptTitle,
    visibility: "unlisted",
    message: {
      content: `:mention[${agent.name}]{sId=${agentConfigurationId}}`,
      mentions: [{ configurationId: agentConfigurationId }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
        username: nonEmptyUsername,
        fullName: user.name,
        email: user.email,
        profilePictureUrl: user.imageUrl,
      },
    },
    contentFragment: {
      title: transcriptTitle,
      content: transcriptContent.toString(),
      url: null,
      contentType: "file_attachment",
      context: {
        username: user.username,
        fullName: user.name,
        email: user.email,
        profilePictureUrl: user.imageUrl,
      },
    },
    blocking: true,
  });

  if (convRes.isErr()) {
    localLogger.error(
      { error: convRes.error },
      "[processTranscriptActivity] Error creating conversation."
    );
    return new Err(new Error(convRes.error.message));
  }

  const { conversation } = convRes.value;
  if (!conversation) {
    localLogger.error(
      "[processTranscriptActivity] No conversation found. Stopping."
    );
    return;
  }

  localLogger.info(
    {
      conversation: {
        sId: conversation.sId,
      },
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
      email: "team@dust.tt",
    },
    subject: `[DUST] Meeting summary - ${transcriptTitle}`,
    html: `<a href="https://dust.tt/w/${owner.sId}/assistant/${conversation.sId}">Open this conversation in Dust</a><br /><br /> ${htmlAnswer}<br /><br />The team at <a href="https://dust.tt">Dust.tt</a>`,
  };

  await sendEmail(user.email, msg);
}
