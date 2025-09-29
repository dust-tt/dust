import { escape } from "html-escaper";
import _ from "lodash";

import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { Authenticator } from "@app/lib/auth";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import type { TrackerGenerationToProcess } from "@app/types";
import { CoreAPI, removeNulls } from "@app/types";

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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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

  const sendEmail =
    generations.length > 0
      ? sendTrackerWithGenerationEmail
      : sendTrackerDefaultEmail;

  await Promise.all(
    Array.from(recipients).map((recipient) =>
      sendEmail({ name, recipient, generations, localLogger })
    )
  );
};

const sendTrackerDefaultEmail = async ({
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
    subject: `[Dust] Tracker ${escape(name)} check complete: No updates required.`,
    body: `
        <p>Tracker: ${escape(name)}.</p>
        <p>No changes detected in watched documents. All maintained documents are up to date.</p>
      `,
  });
};

const sendTrackerWithGenerationEmail = async ({
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
  const dataSourceById = _.keyBy(
    removeNulls(
      generations
        .map((g) => [g.dataSource, g.maintainedDocumentDataSource])
        .flat()
    ),
    "id"
  );

  const docsToFetchByDataSourceId: Record<string, string[]> = {};
  for (const generation of generations) {
    const dataSourceId = generation.dataSource.id;
    if (!docsToFetchByDataSourceId[dataSourceId]) {
      docsToFetchByDataSourceId[dataSourceId] = [];
    }
    docsToFetchByDataSourceId[dataSourceId].push(generation.documentId);

    const maintainedDataSourceId = generation.maintainedDocumentDataSource?.id;
    if (maintainedDataSourceId && generation.maintainedDocumentId) {
      if (!docsToFetchByDataSourceId[maintainedDataSourceId]) {
        docsToFetchByDataSourceId[maintainedDataSourceId] = [];
      }
      docsToFetchByDataSourceId[maintainedDataSourceId].push(
        generation.maintainedDocumentId
      );
    }
  }

  const documentsByIdentifier = new Map<
    string,
    { name: string; url: string | null }
  >();

  // Fetch documents for each data source in parallel.
  await concurrentExecutor(
    Object.entries(docsToFetchByDataSourceId),
    async ([dataSourceId, documentIds]) => {
      const dataSource = dataSourceById[dataSourceId];

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
        documentsByIdentifier.set(`${dataSource.id}__${doc.document_id}`, {
          name: doc.title ?? "Unknown document",
          url: doc.source_url ?? null,
        });
      });
    },
    { concurrency: 5 }
  );

  const generationBody = await Promise.all(
    generations.map((g) => {
      const doc = documentsByIdentifier.get(
        `${g.dataSource.id}__${g.documentId}`
      ) ?? {
        name: "Unknown document",
        url: null,
      };
      const maintainedDoc = g.maintainedDocumentDataSource
        ? documentsByIdentifier.get(
            `${g.maintainedDocumentDataSource.id}__${g.maintainedDocumentId}`
          ) ?? null
        : null;

      const title = doc.url
        ? `<a href="${doc.url}" target="_blank">${doc.name}</a>`
        : `[${doc.name}]`;

      let maintainedTitle: string | null = null;
      if (maintainedDoc) {
        maintainedTitle = maintainedDoc.url
          ? `<a href="${maintainedDoc.url}" target="_blank">${maintainedDoc.name}</a>`
          : `[${maintainedDoc.name}]`;
      }

      let body = `<strong>Changes in document ${title} (${g.dataSource.name})`;
      if (maintainedTitle && g.maintainedDocumentDataSource) {
        body += ` might affect ${maintainedTitle} (${g.maintainedDocumentDataSource.name})`;
      }
      body += `:</strong>`;

      body += `<p>${g.content.replace(/\\n/g, "\n").replace(/\n/g, "<br />")}</p>`;
      return body;
    })
  );

  const body = `
<p>We have new suggestions for your tracker ${escape(name)}:</p>
<p>${generations.length} recommendations were generated due to changes in watched documents.</p>
<br />
<br />
${generationBody.join("<hr />")}
`;

  await sendEmailWithTemplate({
    to: recipient,
    from: {
      name: TRACKER_FROM_NAME,
      email: TRACKER_FROM_EMAIL,
    },
    subject: `[Dust] Tracker ${escape(name)} check complete: Updates required.`,
    body,
  });
};
