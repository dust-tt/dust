import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import sgMail from "@sendgrid/mail";
import type { drive_v3 } from "googleapis";
import * as googleapis from "googleapis";

import { launchProcessTranscriptWorkflow } from "@app/lib/labs/temporal/client";
import { getGoogleAuth } from "@app/lib/labs/transcripts/utils/helpers";
import type { LabsTranscriptsProviderType } from "@app/lib/labs/transcripts/utils/types";
import { User } from "@app/lib/models";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_configuration_resource";
import { LabsTranscriptsHistoryResource } from "@app/lib/resources/labs_transcripts_history_resource";
import mainLogger from "@app/logger/logger";

const {
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
  LABS_API_KEY,
  LABS_WORKSPACE_ID,
  LABS_TRANSCRIPTS_ASSISTANT,
  NODE_ENV,
  SENDGRID_API_KEY,
} = process.env;

export async function retrieveNewTranscriptsActivity(
  userId: number,
  providerId: LabsTranscriptsProviderType
) {
  const logger = mainLogger.child({ userId });

  if (providerId == "google_drive") {
    const auth = await getGoogleAuth(userId);

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

    if (!files.data.files) {
      logger.info("[retrieveNewTranscripts] No new files found");
      return;
    }

    files.data.files.forEach(async (file: drive_v3.Schema$File) => {
      const fileId = file.id as string;

      // Check in history if we already processed this file
      const history = await LabsTranscriptsHistoryResource.findByFileId({
        fileId,
      });
      if (history) {
        logger.info(
          "[retrieveNewTranscripts] File already processed. Skipping.",
          { fileId }
        );
        return;
      }

      await launchProcessTranscriptWorkflow({ userId, fileId });
    });
  }

  logger.info(
    {},
    "[retrieveNewTranscripts] Successful run retrieveNewTranscriptsActivity"
  );
}

export async function processGoogleDriveTranscriptActivity(
  userId: number,
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

  if (!SENDGRID_API_KEY) {
    throw new Error("Missing SENDGRID_API_KEY env variable");
  }
  sgMail.setApiKey(SENDGRID_API_KEY);

  if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
    throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not set");
  }
  logger.info(
    "[processGoogleDriveTranscriptActivity] Starting processing of file ",
    fileId
  );

  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.findByUserIdAndProvider({
      attributes: ["id", "connectionId", "provider", "agentConfigurationId"],
      where: {
        userId: userId,
        provider: providerId,
      },
    });

  if (!transcriptsConfiguration) {
    logger.info(
      {},
      "[processGoogleDriveTranscriptActivity] No configuration found. Stopping."
    );
    return;
  }

  const googleAuth = await getGoogleAuth(userId);
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
    logger.error({}, "Error exporting Google document");
    throw new Error(
      `Error exporting Google document. status_code: ${contentRes.status}. status_text: ${contentRes.statusText}`
    );
  }

  const transcriptTitle = metadataRes.data.name;
  const transcriptContent = contentRes.data;

  const dust = new DustAPI(
    {
      workspaceId: LABS_WORKSPACE_ID as string,
      apiKey: LABS_API_KEY as string,
    },
    logger
  );

  let conversation: ConversationType | undefined = undefined;
  let userMessage: UserMessageType | undefined = undefined;

  const configurationId =
    NODE_ENV == "development" && LABS_TRANSCRIPTS_ASSISTANT
      ? LABS_TRANSCRIPTS_ASSISTANT
      : transcriptsConfiguration.agentConfigurationId;

  if (!configurationId) {
    logger.error(
      "[processGoogleDriveTranscriptActivity] No agent configuration id found. Stopping."
    );
    return;
  }

  const convRes = await dust.createConversation({
    title: null,
    visibility: "unlisted",
    message: {
      content: transcriptContent as string,
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
  });
  if (convRes.isErr()) {
    console.log(convRes.error);
  } else {
    conversation = convRes.value.conversation;
    userMessage = convRes.value.message;

    logger.info(
      "[processGoogleDriveTranscriptActivity] Created conversation " +
        conversation.sId
    );
  }

  if (!conversation) {
    logger.error(
      "[processGoogleDriveTranscriptActivity] No conversation found. Stopping."
    );
    return;
  }

  const agentMessages = conversation.content
    .map((versions: any) => {
      const m = versions[versions.length - 1];
      return m;
    })
    .filter((m) => {
      return (
        m &&
        m.type === "agent_message" &&
        m.parentMessageId === userMessage?.sId
      );
    });

  if (agentMessages.length === 0) {
    return new Err(new Error("Failed to retrieve agent message"));
  }
  const agentMessage = agentMessages[0] as AgentMessageType;

  const streamRes = await dust.streamAgentMessageEvents({
    conversation: conversation,
    message: agentMessage,
  });

  if (streamRes.isErr()) {
    return new Err(new Error(streamRes.error.message));
  }

  let fullAnswer = "";
  for await (const event of streamRes.value.eventStream) {
    switch (event.type) {
      case "user_message_error": {
        return new Err(
          new Error(
            `User message error: code: ${event.error.code} message: ${event.error.message}`
          )
        );
      }

      case "agent_error": {
        return new Err(
          new Error(
            `Agent message error: code: ${event.error.code} message: ${event.error.message}`
          )
        );
      }
      case "generation_tokens": {
        fullAnswer += event.text;
        break;
      }

      default:
      // Nothing to do on unsupported events
    }
  }

  // SEND EMAIL WITH SUMMARY
  const msg = {
    to: transcriptsConfiguration.emailToNotify || user.email,
    from: "team@dust.tt",
    subject: `[DUST] Meeting summary - ${transcriptTitle}`,
    html: `${fullAnswer}<br>` + `The Dust team`,
  };
  void sgMail.send(msg).then(() => {
    logger.info(
      "[processGoogleDriveTranscriptActivity] Email sent with summary"
    );
  });

  // CREATE HISTORY RECORD
  LabsTranscriptsHistoryResource.makeNew({
    configurationId: transcriptsConfiguration.id,
    fileId,
    fileName: transcriptTitle as string,
  }).catch((err) => {
    logger.error(
      "[processGoogleDriveTranscriptActivity] Error creating history record",
      err
    );
  });
}

export async function checkIsActiveActivity({
  userId,
  providerId,
}: {
  userId: number;
  providerId: LabsTranscriptsProviderType;
}) {
  const isActive = await LabsTranscriptsConfigurationResource.getIsActive({
    userId,
    provider: providerId,
  });
  return isActive;
}
