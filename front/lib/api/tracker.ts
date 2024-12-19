import type { TrackerGenerationToProcess } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { Authenticator } from "@app/lib/auth";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import type { Logger } from "@app/logger/logger";

const TRACKER_FROM_EMAIL = "dev@dust.tt";
const TRACKER_FROM_NAME = "Bob Tracker"; // 😬

/**
 * Tracker notification consumer logic.
 * Processes a tracker notification: sends emails to recipients and consumes the tracker.
 */
export const processTrackerNotification = async ({
  trackerId,
  workspaceId,
  currentRunMs,
  localLogger,
}: {
  trackerId: number;
  workspaceId: string;
  currentRunMs: number;
  localLogger: Logger;
}): Promise<void> => {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const tracker =
    await TrackerConfigurationResource.fetchWithGenerationsToConsume(
      auth,
      trackerId
    );

  if (!tracker || !tracker.recipients?.length) {
    localLogger.error(
      {
        trackerId,
      },
      "[Tracker] Tracker not found or found without recipient. Should not be possible from the UI."
    );
    return;
  }

  // Send the tracker email(s).
  const generations = tracker.generations || [];
  await sendTrackerEmail({
    name: tracker.name,
    recipients: tracker.recipients,
    generations,
    localLogger,
  });

  // Consume the tracker & associated generations.
  await TrackerConfigurationResource.consumeGenerations({
    auth,
    trackerId,
    generationIds: generations.map((g) => g.id),
    currentRunMs,
  });
};

/**
 * Email sender for tracker notifications.
 */
const sendTrackerEmail = async ({
  name,
  recipients,
  generations,
  localLogger,
}: {
  name: string;
  recipients: string[];
  generations: TrackerGenerationToProcess[];
  localLogger: Logger;
}): Promise<void> => {
  const uniqueRecipients = new Set(recipients);
  if (!uniqueRecipients.size) {
    throw new Error("No recipients found for tracker");
  }

  const sendEmail =
    generations.length > 0
      ? _sendTrackerWithGenerationEmail
      : _sendTrackerDefaultEmail;

  await Promise.all(
    Array.from(recipients).map((recipient) =>
      sendEmail({ name, recipient, generations, localLogger })
    )
  );
};

const _sendTrackerDefaultEmail = async ({
  name,
  recipient,
}: {
  name: string;
  recipient: string;
}): Promise<void> => {
  await sendEmailWithTemplate({
    to: recipient,
    from: {
      name: TRACKER_FROM_NAME,
      email: TRACKER_FROM_EMAIL,
    },
    subject: `[Dust] Tracker ${name} check complete: No updates required.`,
    body: `
        <p>Tracker: ${name}.</p>
        <p>No changes detected in watched documents. All maintained documents are current</p>
      `,
  });
};

const _sendTrackerWithGenerationEmail = async ({
  name,
  recipient,
  generations,
  localLogger,
}: {
  name: string;
  recipient: string;
  generations: TrackerGenerationToProcess[];
  localLogger: Logger;
}): Promise<void> => {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  const generationBody = await Promise.all(
    generations.map((generation) =>
      _bodyForGeneration(generation, coreAPI, localLogger)
    )
  );
  const body = `
<p>We have new suggestions for your tracker ${name}:</p>
<p>${generations.length} recommendations were generated due to changes in watched documents.</p>
<br />
<br />
${generationBody.join("<br />")}
`;

  await sendEmailWithTemplate({
    to: recipient,
    from: {
      name: TRACKER_FROM_NAME,
      email: TRACKER_FROM_EMAIL,
    },
    subject: `[Dust] Tracker ${name} check complete: Updates required.`,
    body,
  });
};

const _bodyForGeneration = async (
  generation: TrackerGenerationToProcess,
  coreAPI: CoreAPI,
  localLogger: Logger
): Promise<string> => {
  const { documentId, content, thinking, dataSource } = generation;

  // TODO(DOC_TRACKER) Group per data source to call getDataSourceDocuments instead of getDataSourceDocument.
  const docResult = await coreAPI.getDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId,
  });

  if (docResult.isErr()) {
    localLogger.error(
      {
        generation,
        error: docResult.error,
      },
      "[Tracker] Failed to get document info for generation."
    );
  }

  const doc = {
    name: docResult.isOk()
      ? docResult.value.document.title ?? "Unknown document"
      : "Unknown document",
    url: docResult.isOk() ? docResult.value.document.source_url ?? null : null,
  };

  const title = doc.url
    ? `<a href="${doc.url}" target="_blank">${doc.name}</a>`
    : `[${doc.name}]`;

  return [
    `<strong>Changes in document ${title} from ${dataSource.name}:</strong>`,
    thinking && `<p>${thinking}</p>`,
    `<p>${content}.</p>`,
  ]
    .filter(Boolean)
    .join("");
};
