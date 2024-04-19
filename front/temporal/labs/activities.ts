import type { AgentMessageType, ModelId } from "@dust-tt/types";
import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import * as googleapis from "googleapis";

import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { sendEmail } from "@app/lib/email";
import { getGoogleAuthFromUserTranscriptConfiguration } from "@app/lib/labs/transcripts/utils/helpers";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import mainLogger from "@app/logger/logger";

async function retrieveRecentTranscripts(
  {
    userId,
    workspaceId,
  }: {
    userId: ModelId;
    workspaceId: ModelId;
  },
  logger: Logger
) {
  const auth = await getGoogleAuthFromUserTranscriptConfiguration(
    userId,
    workspaceId
  );

  if (!auth) {
    logger.error(
      {},
      "[retrieveRecentTranscripts] No Google auth found. Stopping."
    );
    return [];
  }

  // Only pull transcripts from last day.
  // We could do from the last 15 minutes
  // but we want to avoid missing any if the workflow is down or slow.
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

  const { files: filesData } = files.data;
  if (!filesData || filesData.length === 0) {
    logger.info({}, "[retrieveRecentTranscripts] No new files found.");
    return [];
  }

  return filesData;
}

export async function retrieveNewTranscriptsActivity(
  userId: ModelId,
  workspaceId: ModelId,
  provider: LabsTranscriptsProviderType
): Promise<string[]> {
  const localLogger = mainLogger.child({
    provider,
    userId,
    workspaceId,
  });

  // We only support google_drive for now.
  if (provider !== "google_drive") {
    localLogger.error(
      {},
      "[retrieveNewTranscripts] Provider not supported. Stopping."
    );

    return [];
  }

  const transcriptConfiguration =
    await LabsTranscriptsConfigurationResource.findByUserWorkspaceAndProvider({
      userId,
      workspaceId,
      provider: provider,
    });
  if (!transcriptConfiguration) {
    localLogger.error(
      {},
      "[retrieveNewTranscripts] Transcript configuration not found. Skipping."
    );
    return [];
  }

  const recentTranscriptFiles = await retrieveRecentTranscripts(
    {
      userId,
      workspaceId,
    },
    localLogger
  );

  const fileIdsToProcess: string[] = [];
  for (const recentTranscriptFile of recentTranscriptFiles) {
    const { id: fileId } = recentTranscriptFile;
    if (!fileId) {
      localLogger.error(
        {},
        "[retrieveNewTranscripts] File does not have an id. Skipping."
      );
      continue;
    }

    const history = await transcriptConfiguration.fetchHistoryForFileId(fileId);
    if (history) {
      localLogger.info(
        { fileId },
        "[retrieveNewTranscripts] File already processed. Skipping."
      );
      continue;
    }

    fileIdsToProcess.push(fileId);
  }

  return fileIdsToProcess;
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
    renderLightWorkspaceType({ workspace: owner }),
    { useLocalInDev: true }
  );
  const dustAPI = new DustAPI(prodCredentials, localLogger, {
    useLocalInDev: true,
  });

  const { agentConfigurationId } = transcriptsConfiguration;

  if (!agentConfigurationId) {
    localLogger.error(
      "[processGoogleDriveTranscriptActivity] No agent configuration id found. Stopping."
    );
    return;
  }

  // TODO: Consider using a content fragment to attach the transcript.
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

  const { conversation } = convRes.value;
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

  await sendEmail(user.email, msg);
}
