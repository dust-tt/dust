import { Storage } from "@google-cloud/storage";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

import { transcribeAudioFile } from "@app/lib/api/audio/transcription";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import {
  EnqueueUpsertAudioTranscription,
  enqueueUpsertDocument,
} from "@app/lib/upsert_queue";
import config from "@app/temporal/config";

export async function upsertAudioTranscriptionActivity(upsertQueueId: string) {
  const storage = new Storage({ keyFilename: config.getServiceAccount() });
  const bucket = storage.bucket(config.getUpsertQueueBucket());
  const content = await bucket.file(`${upsertQueueId}.json`).download();

  const upsertDocument = JSON.parse(content.toString());

  const itemValidation = EnqueueUpsertAudioTranscription.decode(upsertDocument);

  if (isLeft(itemValidation)) {
    const pathErrorDocument = reporter.formatValidationErrors(
      itemValidation.left
    );
    throw new Error(
      `Invalid upsertQueue audio transcription: ${pathErrorDocument}`
    );
  }

  const { fileId, workspaceId } = itemValidation.right;

  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
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
      ...itemValidation.right,
      upsertContext: {
        sync_type: "batch",
      },
      section: {
        prefix: null,
        // TODO(VOICE 2025-08-05): Do a proper chunking of the transcript.
        content: transcriptResult.value,
        sections: [],
      },
      mimeType: "text/plain",
    },
  });

  if (enqueueRes.isErr()) {
    throw enqueueRes.error;
  }
}
