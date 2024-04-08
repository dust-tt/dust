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

import { User } from "@app/lib/models";
import { SolutionsTranscriptsConfigurationResource } from "@app/lib/resources/solutions_transcripts_configuration_resource";
import { launchSummarizeTranscriptWorkflow } from "@app/lib/solutions/transcripts/temporal/client";
import { getGoogleAuth } from "@app/lib/solutions/transcripts/utils/helpers";
import mainLogger from "@app/logger/logger";

const {
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
  SOLUTIONS_API_KEY,
  SOLUTIONS_WORKSPACE_ID,
  SOLUTIONS_TRANSCRIPTS_ASSISTANT,
  NODE_ENV,
  SENDGRID_API_KEY
} = process.env;

export async function retrieveNewTranscriptsActivity(
  userId: number,
  providerId: string
) {
  const logger = mainLogger.child({ userId });

  if (providerId == "google_drive") {
    const auth = await getGoogleAuth(userId);

    // Only pull transcripts from the last month
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 31);
    cutoffDate.setHours(0, 0, 0, 0);

    // GET LAST TRANSCRIPTS
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
      await launchSummarizeTranscriptWorkflow({ userId, fileId });
    });
  }

  logger.info(
    {},
    "[retrieveNewTranscripts] Successful run retrieveNewTranscriptsActivity"
  );
}

export async function summarizeGoogleDriveTranscriptActivity(
  userId: number,
  fileId: string
) {
  const logger = mainLogger.child({ userId });
  const providerId = "google_drive";

  const user = await User.findByPk(userId);
  if (!user) {
    logger.error(
      "[summarizeGoogleDriveTranscriptActivity] User not found. Stopping."
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
    "[summarizeGoogleDriveTranscriptActivity] Starting summarization of file ",
    fileId
  );

  const transcriptsConfiguration =
    await SolutionsTranscriptsConfigurationResource.findByUserIdAndProvider({
      attributes: ["id", "connectionId", "provider", "agentConfigurationId"],
      where: {
        userId: userId,
        provider: providerId,
      },
    });

  if (!transcriptsConfiguration) {
    logger.info(
      {},
      "[summarizeGoogleDriveTranscriptActivity] No configuration found. Stopping."
    );
    return;
  }

  const googleAuth = await getGoogleAuth(userId);
  const drive = googleapis.google.drive({ version: "v3", auth: googleAuth });

  const metadataRes = await drive.files.get({
    fileId: fileId,
    fields: 'name'
  });

  const contentRes = await drive
    .files.export({
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
      workspaceId: SOLUTIONS_WORKSPACE_ID as string,
      apiKey: SOLUTIONS_API_KEY as string,
    },
    logger
  );

  let conversation: ConversationType | undefined = undefined;
  let userMessage: UserMessageType | undefined = undefined;

  const configurationId =
    SOLUTIONS_TRANSCRIPTS_ASSISTANT && NODE_ENV == "development"
      ? SOLUTIONS_TRANSCRIPTS_ASSISTANT
      : transcriptsConfiguration.agentConfigurationId;

  if (!configurationId) {
    logger.error(
      "[summarizeGoogleDriveTranscriptActivity] No agent configuration id found. Stopping."
    );
    return;
  }

  const convRes = await dust.createConversation({
    title: null,
    visibility: "unlisted",
    message: {
      content:
        "This is a meeting note transcript that you need to summarize. Always answer in HTML format using simple HTML tags: \n\n" + transcriptContent,
      mentions: [{ configurationId }],
      context: {
        timezone: "Europe/Paris",
        username: "solutions-transcript-summarizer",
        fullName: null,
        email: null,
        profilePictureUrl: null,
      },
    },
    contentFragment: undefined,
    isSync: true,
  });
  if (convRes.isErr()) {
    console.log(convRes.error);
  } else {
    conversation = convRes.value.conversation;
    userMessage = convRes.value.message;

    logger.info(
      "[summarizeGoogleDriveTranscriptActivity] Created conversation " +
        conversation.sId
    );
  }

  if (!conversation) {
    logger.error(
      "[summarizeGoogleDriveTranscriptActivity] No conversation found. Stopping."
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

  console.log("Streaming answer...");

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
    to: user.email,
    from: "team@dust.tt",
    subject: `[DUST] Meeting summary - ${transcriptTitle}`,
    html:
      `${fullAnswer}<br>` +
      `The Dust team`,
  };

  void sgMail.send(msg).then(() => {
    logger.info(
      "[summarizeGoogleDriveTranscriptActivity] Email sent with summary"
    );
  });

  console.log('EMAIL SENT :')
  console.log(msg)
}
