import { getAccessTokenFromNango } from "@app/lib/labs/transcripts/utils/helpers";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";

export async function retrieveGongTranscripts(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  localLogger: Logger
): Promise<string[]> {
  // Retrieve transcripts from Gong from the last 24h
  const fromDateTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  if (!transcriptsConfiguration.connectionId) {
    localLogger.error(
      {},
      "[retrieveGongTranscripts] No connectionId found. Skipping."
    );
    return [];
  }

  const gongAccessToken = await getAccessTokenFromNango(
    "gong-dev",
    transcriptsConfiguration.connectionId
  );

  const newTranscripts = await fetch(
    `https://api.gong.io/v2/calls?fromDateTime=${fromDateTime}`,
    {
      headers: {
        Authorization: `Bearer ${gongAccessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!newTranscripts.ok) {
    localLogger.error(
      {},
      "[retrieveNewTranscripts] Error fetching new transcripts from Gong. Skipping."
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
      localLogger.error(
        {},
        "[retrieveNewTranscripts] call does not have an id. Skipping."
      );
      continue;
    }

    const history = await transcriptsConfiguration.fetchHistoryForFileId(
      fileId
    );
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
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  fileId: string,
  localLogger: Logger
): Promise<{ transcriptTitle: string; transcriptContent: string } | null> {
  type GongParticipant = {
    speakerId: string;
    name: string;
  };

  const gongAccessToken = await getAccessTokenFromNango(
    "gong-dev",
    transcriptsConfiguration.connectionId
  );

  const call = await fetch(`https://api.gong.io/v2/calls/extensive`, {
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

  if (!call.ok) {
    localLogger.error(
      {},
      "[processTranscriptActivity] Error fetching call from Gong. Skipping."
    );
    throw new Error("Error fetching call from Gong. Skipping.");
  }

  const callData: {
    participants: GongParticipant[];
    metaData: { title: string; started: string; duration: number };
  } = (await call.json()).calls[0];

  if (!callData) {
    localLogger.error(
      {},
      "[processTranscriptActivity] Call data not found from Gong. Skipping."
    );
    throw new Error("Call data not found from Gong. Skipping.");
  }

  const participants: { [key: string]: string } = {};
  callData.participants?.map((participant: GongParticipant) => {
    participants[participant.speakerId] = participant.name;
  });

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
      {},
      "[processTranscriptActivity] Error fetching transcript from Gong. Skipping."
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
      "[processTranscriptActivity] No transcript content found from Gong."
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

  // Rebuild the transcript content.
  transcriptParagraph.map(
    (paragraph: {
      speakerId: string;
      topic: string | null;
      sentences: { start: number; end: number; text: string }[];
    }) => {
      paragraph.sentences.map(
        (sentence: { start: number; end: number; text: string }) => {
          transcriptContent += `${
            participants[paragraph.speakerId] || "Unknown"
          }: ${sentence.text}\n`;
        }
      );
    }
  );

  return { transcriptTitle, transcriptContent };
}
