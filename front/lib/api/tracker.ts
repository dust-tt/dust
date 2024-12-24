import type { TrackerGenerationToProcess } from "@dust-tt/types";
import { concurrentExecutor, CoreAPI } from "@dust-tt/types";
import _ from "lodash";

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
  if (generations.length > 0 || !tracker.skipEmptyEmails) {
    await sendTrackerEmail({
      name: tracker.name,
      recipients: tracker.recipients,
      generations,
      localLogger,
    });
  }

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

  if (generations.length) {
    await _sendTrackerWithGenerationEmails({
      name,
      recipients,
      generations,
      localLogger,
    });
  } else {
    await _sendTrackerDefaultEmails({ name, recipients });
  }
};

const _sendTrackerDefaultEmails = async ({
  name,
  recipients,
}: {
  name: string;
  recipients: string[];
}): Promise<void> => {
  await sendEmailWithTemplate({
    to: recipients,
    from: {
      name: TRACKER_FROM_NAME,
      email: TRACKER_FROM_EMAIL,
    },
    subject: `[Dust] Tracker ${name} check complete: No updates required.`,
    body: `
        <p>Tracker: ${name}.</p>
        <p>No changes detected in watched documents. All maintained documents are up to date.</p>
      `,
  });
};

const _sendTrackerWithGenerationEmails = async ({
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
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);
  const generationsByDataSources = _.groupBy(generations, "dataSource.id");
  const documentsById = new Map();

  // Fetch documents for each data source in parallel.
  await concurrentExecutor(
    Object.entries(generationsByDataSources),
    async ([, generations]) => {
      const dataSource = generations[0].dataSource;
      const documentIds = [...new Set(generations.map((g) => g.documentId))];

      const docsResult = await coreAPI.getDataSourceDocuments({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        documentIds,
      });

      if (docsResult.isErr()) {
        localLogger.error(
          {
            documentIds,
            dataSourceId: dataSource.id,
            error: docsResult.error,
          },
          "[Tracker] Failed to get documents info for generation."
        );
        return;
      }

      docsResult.value.documents.forEach((doc) => {
        documentsById.set(doc.document_id, {
          name: doc.title ?? "Unknown document",
          url: doc.source_url ?? null,
        });
      });
    },
    { concurrency: 5 }
  );

  const generationBody = generations.map((generation) => {
    const doc = documentsById.get(generation.documentId) ?? {
      name: "Unknown document",
      url: null,
    };

    const title = doc.url
      ? `<a href="${doc.url}" target="_blank">${doc.name}</a>`
      : `[${doc.name}]`;

    return [
      `<strong>Changes in document ${title} from ${generation.dataSource.name}:</strong>`,
      generation.thinking && `<p${generation.thinking}</p>`,
      `<p>${generation.content}.</p>`,
    ]
      .filter(Boolean)
      .join("");
  });

  const body = `
<p>We have new suggestions for your tracker ${name}:</p>
<p>${generations.length} recommendations were generated due to changes in watched documents.</p>
<br />
<br />
${generationBody.join("<br />")}
`;

  await sendEmailWithTemplate({
    to: recipients,
    from: {
      name: TRACKER_FROM_NAME,
      email: TRACKER_FROM_EMAIL,
    },
    subject: `[Dust] Tracker ${name} check complete: Updates required.`,
    body,
  });
};
