import type { AgentMessageType, ModelId, ProviderType } from "@dust-tt/types";
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
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import mainLogger from "@app/logger/logger";
import { launchProcessTranscriptWorkflow } from "@app/temporal/labs/client";

sgMail.setApiKey(apiConfig.getSendgridApiKey());

export async function retrieveNewTranscriptsActivity(
  userId: ModelId,
  workspaceId: ModelId,
  provider: LabsTranscriptsProviderType
) {
  const localLogger = mainLogger.child({
    provider,
    userId,
    workspaceId,
  });

  if (provider == "google_drive") {
    const auth = await getGoogleAuthFromUserTranscriptConfiguration(
      userId,
      workspaceId
    );

    if (!auth) {
      localLogger.error(
        {},
        "[retrieveNewTranscripts] No Google auth found. Stopping."
      );
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

    if (!files.data.files || files.data.files.length === 0) {
      localLogger.info({}, "[retrieveNewTranscripts] No new files found.");
      return;
    }

    const transcriptConfiguration =
      await LabsTranscriptsConfigurationResource.findByUserWorkspaceAndProvider(
        {
          userId,
          workspaceId,
          provider: provider,
        }
      );

    if (!transcriptConfiguration) {
      return;
    }

    const { files: filesData } = files.data;
    for (const file of filesData) {
      const { id: fileId } = file;
      if (!fileId) {
        localLogger.error(
          { file: file.id },
          "[retrieveNewTranscripts] File does not have an id. Skipping."
        );
        continue;
      }

      const history = await transcriptConfiguration.fetchHistoryForFileId(
        fileId
      );
      if (history) {
        localLogger.info(
          { fileId },
          "[retrieveNewTranscripts] File already processed. Skipping."
        );
        continue;
      }

      await launchProcessTranscriptWorkflow({ userId, workspaceId, fileId });
    }
  } else {
    localLogger.error(
      {},
      "[retrieveNewTranscripts] Provider not supported. Stopping."
    );
  }
}

export async function processGoogleDriveTranscriptActivity(
  userId: ModelId,
  workspaceId: ModelId,
  fileId: string
) {
  const provider = "google_drive";

  const localLogger = mainLogger.child({
    fileId,
    provider,
    userId,
    workspaceId,
  });

  const user = await User.findByPk(userId);
  if (!user) {
    localLogger.error(
      {},
      "[processGoogleDriveTranscriptActivity] User not found. Stopping."
    );
    return;
  }

  localLogger.info(
    {},
    "[processGoogleDriveTranscriptActivity] Starting processing of file "
  );

  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.findByUserWorkspaceAndProvider({
      userId: userId,
      workspaceId: workspaceId,
      provider: provider,
    });

  if (!transcriptsConfiguration) {
    localLogger.info(
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
    localLogger.error(
      { error: contentRes.statusText },
      "Error exporting Google document."
    );

    throw new Error(
      `Error exporting Google document. status_code: ${contentRes.status}. status_text: ${contentRes.statusText}`
    );
  }

  const transcriptTitle = metadataRes.data.name || "Untitled";
  const transcriptContent = contentRes.data;
  const extraInstructions =
    "IMPORTANT: Answer in HTML format and NOT IN MARKDOWN.";

  // TODO: We should enforce that user is a member of the workspace.
  const owner = await Workspace.findByPk(workspaceId);
  if (!owner) {
    throw new Error(
      `Could not find workspace for user (workspaceId: ${workspaceId}).`
    );
  }
  const prodCredentials = await prodAPICredentialsForOwner(
    renderLightWorkspaceType({ workspace: owner })
  );
  const dustAPI = new DustAPI(prodCredentials, localLogger);

  const { agentConfigurationId } = transcriptsConfiguration;

  if (!agentConfigurationId) {
    localLogger.error(
      "[processGoogleDriveTranscriptActivity] No agent configuration id found. Stopping."
    );
    return;
  }

  // TODO:
  const convRes = await dustAPI.createConversation({
    title: null,
    visibility: "unlisted",
    message: {
      content: transcriptContent + extraInstructions,
      mentions: [{ configurationId: agentConfigurationId }],
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
    localLogger.error(
      { error: convRes.error },
      "[processGoogleDriveTranscriptActivity] Error creating conversation."
    );
    return new Err(new Error(convRes.error.message));
  }

  const conversation = convRes.value.conversation;

  if (!conversation) {
    localLogger.error(
      "[processGoogleDriveTranscriptActivity] No conversation found. Stopping."
    );
    return;
  }

  localLogger.info(
    {
      conversation: {
        sId: conversation.sId,
      },
    },
    "[processGoogleDriveTranscriptActivity] Created conversation."
  );

  // Get first from array with type='agent_message' in conversation.content;
  const agentMessage = <AgentMessageType[]>conversation.content.find(
    (innerArray) => {
      return innerArray.find((item) => item.type === "agent_message");
    }
  );
  const fullAnswer = agentMessage ? agentMessage[0].content : "";

  const hasExistingHistory =
    await transcriptsConfiguration.fetchHistoryForFileId(fileId);
  if (hasExistingHistory) {
    localLogger.info(
      "[processGoogleDriveTranscriptActivity] History record already exists. Stopping."
    );
    return;
  }

  await transcriptsConfiguration.recordHistory({
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
  provider,
}: {
  userId: ModelId;
  workspaceId: ModelId;
  provider: LabsTranscriptsProviderType;
}) {
  const transcriptConfiguration =
    await LabsTranscriptsConfigurationResource.findByUserWorkspaceAndProvider({
      provider,
      userId,
      workspaceId,
    });
  if (!transcriptConfiguration) {
    return false;
  }

  return transcriptConfiguration.isActive;
}
