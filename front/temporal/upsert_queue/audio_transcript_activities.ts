import { Storage } from "@google-cloud/storage";

import { transcribeAudioFile } from "@app/lib/api/audio/transcription";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { enqueueUpsertDocument } from "@app/lib/upsert_queue";
import config from "@app/temporal/config";

export async function upsertAudioTranscriptionActivity(upsertQueueId: string) {
  const storage = new Storage({ keyFilename: config.getServiceAccount() });
  const bucket = storage.bucket(config.getUpsertQueueBucket());
  const content = await bucket.file(`${upsertQueueId}.json`).download();

  const upsertDocument = JSON.parse(content.toString());

  const fileId = upsertDocument.fileId;

  const auth = await Authenticator.internalAdminForWorkspace(
    upsertDocument.workspaceId
  );
  const fileResource = await FileResource.fetchById(auth, fileId);
  if (!fileResource) {
    throw new Error("File not found");
  }

  const transcriptResult = await transcribeAudioFile(auth, fileResource);
  if (transcriptResult.isErr()) {
    throw transcriptResult.error;
  }

  const enqueueRes = await enqueueUpsertDocument({
    upsertDocument: {
      workspaceId: upsertDocument.workspaceId,
      dataSourceId: upsertDocument.dataSourceId,
      documentId: upsertDocument.documentId,
      tags: upsertDocument.tags,
      parentId: upsertDocument.parentId || null,
      parents: upsertDocument.parents || [upsertDocument.documentId],
      timestamp: upsertDocument.timestamp,
      sourceUrl: upsertDocument.sourceUrl,
      section: {
        prefix: null,
        // TODO(VOICE 2025-08-05): Do a proper chunking of the transcript.
        content: transcriptResult.value,
        sections: [],
      },
      upsertContext: upsertDocument.upsertContext || null,
      title: upsertDocument.title,
      mimeType: "text/plain",
    },
  });

  if (enqueueRes.isErr()) {
    throw enqueueRes.error;
  }
}
