import OpenAI from "openai";

import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { dustManagedCredentials, Err, normalizeError, Ok } from "@app/types";

export async function transcribeAudioFile(
  auth: Authenticator,
  fileResource: FileResource
): Promise<Result<string, Error>> {
  logger.info(
    {
      fileId: fileResource.sId,
      fileName: fileResource.fileName,
      fileSize: fileResource.fileSize,
    },
    "Starting audio transcription"
  );

  const credentials = dustManagedCredentials();
  const openai = new OpenAI({
    apiKey: credentials.OPENAI_API_KEY,
  });

  // Get the file as a buffer.
  // TODO(VOICE 2025-08-05): This is a hack to get the file as a buffer. Find more robust streaming
  // solution.
  const readStream = fileResource.getReadStream({
    auth,
    version: "original",
  });

  // Convert stream to buffer.
  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(chunk);
  }
  const audioBuffer = Buffer.concat(chunks);

  // Create a File-like object for OpenAI.
  // TODO(VOICE 2025-08-05): This is a hack to get the file as a buffer. Find more robust streaming
  // solution.
  const file = new File([audioBuffer], fileResource.fileName, {
    type: "audio/mp4",
  });

  try {
    const result = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-transcribe",
    });

    return new Ok(result.text);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
