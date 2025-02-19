import { getOAuthConnectionAccessToken } from "@dust-tt/types";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";

const getGongAccessToken = async (
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  logger: Logger
) => {
  if (!transcriptsConfiguration.connectionId) {
    throw new Error(
      "[retrieveGongTranscripts] No connectionId found for transcriptsConfiguration Gong oauth connection."
    );
  }

  const tokRes = await getOAuthConnectionAccessToken({
    config: config.getOAuthAPIConfig(),
    logger,
    provider: "gong",
    connectionId: transcriptsConfiguration.connectionId,
  });
  if (tokRes.isErr()) {
    logger.error(
      {
        connectionId: transcriptsConfiguration.connectionId,
        error: tokRes.error,
      },
      "[retrieveGongTranscripts] Error retrieving Gong access token"
    );
    throw new Error("Error retrieving Gong access token");
  }

  return tokRes.value.access_token;
};

export async function retrieveGongTranscripts(
  auth: Authenticator,
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  localLogger: Logger
): Promise<string[]> {
  if (!transcriptsConfiguration) {
    localLogger.error(
      {},
      "[retrieveGongTranscripts] No default transcripts configuration found."
    );
    return [];
  }

  if (!transcriptsConfiguration.connectionId) {
    localLogger.error(
      {},
      "[retrieveGongTranscripts] No connectionId found for default configuration. Skipping."
    );
    return [];
  }

  const gongAccessToken = await getGongAccessToken(
    transcriptsConfiguration,
    localLogger
  );

  // TEMP: Get the last 2 weeks if labs_transcripts_full_storage FF is enabled.
  const flags = await getFeatureFlags(auth.getNonNullableWorkspace());
  const daysOfHistory = flags.includes("labs_transcripts_full_storage")
    ? 14
    : 1;

  const fromDateTime = new Date(
    Date.now() - daysOfHistory * 24 * 60 * 60 * 1000
  ).toISOString();
  const newTranscripts = await fetch(
    `https://api.gong.io/v2/calls?fromDateTime=${fromDateTime}`,
    {
      headers: {
        Authorization: `Bearer ${gongAccessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (newTranscripts.status === 404) {
    localLogger.info(
      {},
      "[retrieveNewTranscripts] No new Gong transcripts found. Stopping."
    );
    return [];
  }

  if (!newTranscripts.ok) {
    localLogger.error(
      { status: newTranscripts.status },
      "[retrieveNewTranscripts] Error fetching new transcripts from Gong. Stopping."
    );
    return [];
  }

  const newTranscriptsData = await newTranscripts.json();

  if (!newTranscriptsData || newTranscriptsData.length === 0) {
    localLogger.info(
      {},
      "[retrieveNewTranscripts] No new transcripts found from Gong."
    );
    return [];
  }

  const fileIdsToProcess = [];

  for (const call of newTranscriptsData.calls) {
    const { id: fileId } = call;
    if (!fileId) {
      localLogger.warn(
        {},
        "[retrieveNewTranscripts] Gong call does not have an id. Skipping."
      );
      continue;
    }

    const history =
      await transcriptsConfiguration.fetchHistoryForFileId(fileId);
    if (history) {
      localLogger.info(
        { fileId },
        "[retrieveNewTranscripts] call already processed. Skipping."
      );
      continue;
    }

    fileIdsToProcess.push(fileId);
  }

  return fileIdsToProcess;
}

export async function retrieveGongTranscriptContent(
  auth: Authenticator,
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  fileId: string,
  localLogger: Logger
): Promise<{
  transcriptTitle: string;
  transcriptContent: string;
  userParticipated: boolean;
} | null> {
  if (!transcriptsConfiguration || !transcriptsConfiguration.connectionId) {
    localLogger.error(
      {
        fileId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
      },
      "[retrieveGongTranscripts] No connectionId found. Skipping."
    );
    throw new Error(
      "No connectionId for transcriptsConfiguration found. Skipping."
    );
  }

  const gongAccessToken = await getGongAccessToken(
    transcriptsConfiguration,
    localLogger
  );

  const findGongUser = async () => {
    const user = await transcriptsConfiguration.getUser();

    if (!user) {
      localLogger.error(
        {},
        "[retrieveGongTranscripts] User not found. Skipping."
      );
      return null;
    }

    const gongUsers = await fetch(`https://api.gong.io/v2/users`, {
      headers: {
        Authorization: `Bearer ${gongAccessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!gongUsers.ok) {
      localLogger.error(
        {
          fileId,
          transcriptsConfigurationId: transcriptsConfiguration.id,
        },
        "[retrieveGongTranscripts] Error fetching Gong users. Skipping."
      );
      return null;
    }

    const gongUsersData = await gongUsers.json();

    if (!gongUsersData || gongUsersData.length === 0) {
      localLogger.error(
        {
          fileId,
          transcriptsConfigurationId: transcriptsConfiguration.id,
        },
        "[retrieveGongTranscripts] No Gong users found. Skipping."
      );
      return null;
    }

    const gongUser = gongUsersData.users.find(
      (gongUser: { emailAddress: string }) =>
        gongUser.emailAddress === user.email
    );

    return gongUser;
  };

  const call = await fetch(`https://api.gong.io/v2/calls/extensive`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gongAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contentSelector: {
        exposedFields: {
          parties: true,
        },
      },
      filter: {
        callIds: [fileId],
      },
    }),
  });

  if (!call.ok) {
    localLogger.error(
      {
        fileId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
      },
      "[retrieveGongTranscripts] Error fetching call from Gong. Skipping."
    );
    throw new Error("Error fetching call from Gong. Skipping.");
  }

  const callData: {
    parties: {
      userId: string;
      speakerId: string;
      name: string;
    }[];
    metaData: { title: string; started: string; duration: number };
  } = (await call.json()).calls[0];

  if (!callData) {
    localLogger.error(
      {
        fileId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
      },
      "[retrieveGongTranscripts] Call data not found from Gong. Skipping."
    );
    return null;
  }

  const participantsUsers: { [key: string]: string } = {};
  const participantsSpeakers: { [key: string]: string } = {};

  if (callData.parties) {
    for (const participant of callData.parties) {
      participantsUsers[participant.userId] = participant.name;
      participantsSpeakers[participant.speakerId] = participant.name;
    }
  }

  const gongUser = await findGongUser();
  const userParticipated =
    gongUser && participantsUsers[gongUser.id] ? true : false;

  localLogger.info(
    {
      fileId,
      gongUser,
      participantsUsers,
      participantsSpeakers,
      userParticipated,
    },
    "[retrieveGongTranscripts] User participated in the call?"
  );

  const transcript = await fetch(`https://api.gong.io/v2/calls/transcript`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gongAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: {
        callIds: [fileId],
      },
    }),
  });

  if (!transcript.ok) {
    localLogger.error(
      {
        fileId,
      },
      "[retrieveGongTranscripts] Error fetching transcript from Gong. Skipping."
    );
    throw new Error("Error fetching transcript from Gong. Skipping.");
  }

  const callsData: {
    callTranscripts: {
      transcript: {
        speakerId: string;
        topic: string | null;
        sentences: { start: number; end: number; text: string }[];
      }[];
    }[];
  } = await transcript.json();
  const transcriptParagraph = callsData.callTranscripts[0]?.transcript;

  if (!transcriptParagraph || transcriptParagraph.length === 0) {
    localLogger.info(
      {},
      "[retrieveGongTranscripts] No transcript content found from Gong."
    );
    return null;
  }

  const hours = Math.floor(callData.metaData.duration / 3600);
  const minutes = Math.floor((callData.metaData.duration % 3600) / 60);
  const callDuration = `${hours} hours ${
    minutes < 10 ? "0" + minutes : minutes
  } minutes`;

  const transcriptTitle = callData.metaData.title || "Untitled";
  let transcriptContent = `Meeting title: ${
    transcriptTitle || "Untitled"
  }\n\nDate: ${callData.metaData.started}\n\nDuration: ${callDuration}\n\n`;

  // Rebuild the transcript content with [User]: [sentence].
  transcriptParagraph.map(
    (paragraph: {
      speakerId: string;
      topic: string | null;
      sentences: { start: number; end: number; text: string }[];
    }) => {
      let lastSpeakerId: string | null = null;
      paragraph.sentences.map(
        (sentence: { start: number; end: number; text: string }) => {
          if (paragraph.speakerId !== lastSpeakerId) {
            transcriptContent += `${
              participantsSpeakers[paragraph.speakerId] || "Unknown"
            }: `;
            lastSpeakerId = paragraph.speakerId;
          }
          transcriptContent += `${sentence.text}\n`;
        }
      );
    }
  );

  return { transcriptTitle, transcriptContent, userParticipated };
}
