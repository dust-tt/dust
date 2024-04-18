import type { AgentMessageType, ModelId } from "@dust-tt/types";
import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import sgMail from "@sendgrid/mail";
import * as googleapis from "googleapis";

import apiConfig from "@app/lib/api/config";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { sendEmail } from "@app/lib/email";
import config from "@app/lib/labs/config";
import { getGoogleAuthFromUserTranscriptConfiguration } from "@app/lib/labs/transcripts/utils/helpers";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import {
  LabsTranscriptsConfigurationResource,
  LabsTranscriptsHistoryResource,
} from "@app/lib/resources/labs_transcripts_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import mainLogger from "@app/logger/logger";
import { launchProcessTranscriptWorkflow } from "@app/temporal/labs/client";

sgMail.setApiKey(apiConfig.getSendgridApiKey());

export async function retrieveNewTranscriptsActivity(
  userId: ModelId,
  workspaceId: ModelId,
  providerId: LabsTranscriptsProviderType
) {
  const logger = mainLogger.child({ userId });

  if (providerId == "google_drive") {
    const auth = await getGoogleAuthFromUserTranscriptConfiguration(
      userId,
      workspaceId
    );

    if (!auth) {
      logger.error("[retrieveNewTranscripts] No Google auth found. Stopping.");
      return;
    }

    // Only pull transcripts from last day
    // We could do from the last 15 minutes
    // but we want to avoid missing any if the workflow is down
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 1);

    const files = await googleapis.google
      .drive({ version: "v3", auth })
      .files.list({
        q:
          "name contains '- Transcript' and createdTime > '" +
          cutoffDate.toISOString() +
          "'",
        fields: "files(id, name)",
      });

    if (files.data.files?.length !== 0) {
      logger.info("[retrieveNewTranscripts] No new files found");
      return;
    }

    const filesData = files.data.files;
    for (let i = 0; i < filesData.length; i++) {
      const file = filesData[i];
      if (!file.id) {
        logger.error(
          { file },
          "[retrieveNewTranscripts] File does not have an id. Skipping."
        );
        continue;
      }
      const fileId = file.id;
      const history = await LabsTranscriptsHistoryResource.findByFileId({
        fileId,
      });
      if (history) {
        logger.info(
          { fileId },
          "[retrieveNewTranscripts] File already processed. Skipping."
        );
        continue;
      }
      await launchProcessTranscriptWorkflow({ userId, workspaceId, fileId });
    }
  } else {
    // throw error
    logger.error(
      {
        providerId,
      },
      "[retrieveNewTranscripts] Provider not supported. Stopping."
    );
  }
}

export async function processGoogleDriveTranscriptActivity(
  userId: ModelId,
  workspaceId: ModelId,
  fileId: string
) {
  const logger = mainLogger.child({ userId });
  const providerId = "google_drive";

  const user = await User.findByPk(userId);
  if (!user) {
    logger.error(
      "[processGoogleDriveTranscriptActivity] User not found. Stopping."
    );
    return;
  }

  logger.info(
    fileId,
    "[processGoogleDriveTranscriptActivity] Starting processing of file "
  );

  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.findByUserWorkspaceAndProvider({
      userId: userId,
      workspaceId: workspaceId,
      provider: providerId,
    });

  if (!transcriptsConfiguration) {
    logger.info(
      "[processGoogleDriveTranscriptActivity] No configuration found. Stopping."
    );
    return;
  }

  const googleAuth = await getGoogleAuthFromUserTranscriptConfiguration(
    userId,
    workspaceId
  );
  const drive = googleapis.google.drive({ version: "v3", auth: googleAuth });

  const metadataRes = await drive.files.get({
    fileId: fileId,
    fields: "name",
  });

  const contentRes = await drive.files.export({
    fileId: fileId,
    mimeType: "text/plain",
  });

  if (contentRes.status !== 200) {
    logger.error(
      { error: contentRes.statusText },
      "Error exporting Google document"
    );
    throw new Error(
      `Error exporting Google document. status_code: ${contentRes.status}. status_text: ${contentRes.statusText}`
    );
  }

  const transcriptTitle = metadataRes.data.name || "Untitled";
  const transcriptContent = contentRes.data;
  const extraInstructions =
    "IMPORTANT: Answer in HTML format and NOT IN MARKDOWN.";

<<<<<<< HEAD
<<<<<<< Updated upstream
  const dust = new DustAPI(
=======
  const dustAPI = new DustAPI(
>>>>>>> 8e6bbce7e (Lint)
    {
      workspaceId: config.getLabsWorkspaceId(),
      apiKey: config.getLabsApiKey(),
    },
    logger
=======
  const owner = await Workspace.findByPk(workspaceId);
  if (!owner) {
    throw new Error(
      `Could not get internal builder for workspace ${workspaceId}`
    );
  }
  const prodCredentials = await prodAPICredentialsForOwner(
    renderLightWorkspaceType({workspace: owner})
>>>>>>> Stashed changes
  );
  const dustAPI = new DustAPI(prodCredentials, logger);

  const configurationId =
    config.getLabsTranscriptsAssistantId() ||
    transcriptsConfiguration.agentConfigurationId;

  if (!configurationId) {
    logger.error(
      "[processGoogleDriveTranscriptActivity] No agent configuration id found. Stopping."
    );
    return;
  }

  const convRes = await dustAPI.createConversation({
    title: null,
    visibility: "unlisted",
    message: {
      content: transcriptContent + extraInstructions,
      mentions: [{ configurationId }],
      context: {
        timezone: "Europe/Paris",
        username: "labs-transcript-processor",
        fullName: null,
        email: null,
        profilePictureUrl: null,
      },
    },
    contentFragment: undefined,
    blocking: true,
  });

  if (convRes.isErr()) {
    logger.error(
      convRes.error, // Remove curly braces and add a comma after convRes.error
      "[processGoogleDriveTranscriptActivity] Error creating conversation"
    );
    return new Err(new Error(convRes.error.message));
  }

  const conversation = convRes.value.conversation;

  if (!conversation) {
    logger.error(
      "[processGoogleDriveTranscriptActivity] No conversation found. Stopping."
    );
    return;
  }

  logger.info(
    "[processGoogleDriveTranscriptActivity] Created conversation " +
      conversation.sId
  );

  //Get first from array with type='agent_message' in conversation.content;
  const agentMessage = <AgentMessageType[]>conversation.content.find(
    (innerArray) => {
      return innerArray.find((item) => item.type === "agent_message");
    }
  );
  const fullAnswer = agentMessage ? agentMessage[0].content : "";

  const hasExistingHistory = await LabsTranscriptsHistoryResource.findByFileId({
    fileId,
  });

  if (hasExistingHistory) {
    logger.info(
      "[processGoogleDriveTranscriptActivity] History record already exists. Stopping."
    );
    return;
  }

  await LabsTranscriptsHistoryResource.makeNew({
    configurationId: transcriptsConfiguration.id,
    fileId,
    fileName: transcriptTitle,
  });

  const msg = {
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: `[DUST] Meeting summary - ${transcriptTitle}`,
    html: `${fullAnswer}<br>` + `The Dust team`,
  };

  await sendEmail(transcriptsConfiguration.emailToNotify || user.email, msg);
}

export async function checkIsActiveActivity({
  userId,
  workspaceId,
  providerId,
}: {
  userId: ModelId;
  workspaceId: ModelId;
  providerId: LabsTranscriptsProviderType;
}) {
  const isActive = await LabsTranscriptsConfigurationResource.getIsActive({
    userId,
    workspaceId,
    provider: providerId,
  });
  return isActive;
}
