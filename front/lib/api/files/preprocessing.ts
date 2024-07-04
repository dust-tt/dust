import { buffer } from "node:stream/consumers";

import type {
  FileUseCase,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

// Images preprocessing.

const resizeAndUploadToFileStorage: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const readStream = file.getReadStream(auth, "original");

  // Resize the image, preserving the aspect ratio. Longest side is max 768px.
  const resizedImageStream = sharp().resize(768, 768, {
    fit: sharp.fit.inside, // Ensure longest side is 768px.
    withoutEnlargement: true, // Avoid upscaling if image is smaller than 768px.
  });

  const writeStream = file.getWriteStream(auth, "processed");

  try {
    await pipeline(readStream, resizedImageStream, writeStream);

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to resize image."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";

    return new Err(new Error(`Failed resizing image. ${errorMessage}`));
  }
};

// PDF preprocessing.

async function createPdfTextStream(buffer: Buffer) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  return new Readable({
    async read() {
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const strings = content.items.map((item) => {
          if (
            item &&
            typeof item === "object" &&
            "str" in item &&
            typeof item.str === "string"
          ) {
            return item.str;
          }
        });

        const pageText = `Page: ${pageNum}/${pdf.numPages}\n${strings.join(" ")}\n\n`;
        this.push(pageText);
      }
      this.push(null);
    },
  });
}

const extractTextFromPDF: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  try {
    const readStream = file.getReadStream(auth, "original");
    // Load file in memory.
    const arrayBuffer = await buffer(readStream);

    const writeStream = file.getWriteStream(auth, "processed");
    const pdfTextStream = await createPdfTextStream(arrayBuffer);

    await pipeline(
      pdfTextStream,
      async function* (source) {
        for await (const chunk of source) {
          yield chunk;
        }
      },
      writeStream
    );

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to extract text from PDF."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";

    return new Err(
      new Error(`Failed extracting text from PDF. ${errorMessage}`)
    );
  }
};

// Other text files preprocessing.

// We don't apply any processing to these files, we just store the raw text.
const storeRawText: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const readStream = file.getReadStream(auth, "original");
  const writeStream = file.getWriteStream(auth, "processed");

  try {
    await pipeline(readStream, writeStream);

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to store raw text."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";

    return new Err(new Error(`Failed to store raw text ${errorMessage}`));
  }
};

// Preprocessing for file upload.

type PreprocessingFunction = (
  auth: Authenticator,
  file: FileResource
) => Promise<Result<undefined, Error>>;

type PreprocessingPerUseCase = {
  [k in FileUseCase]: PreprocessingFunction | undefined;
};

type PreprocessingPerContentType = {
  [k in SupportedFileContentType]: PreprocessingPerUseCase | undefined;
};

const processingPerContentType: PreprocessingPerContentType = {
  "application/pdf": {
    conversation: extractTextFromPDF,
  },
  "image/jpeg": {
    conversation: resizeAndUploadToFileStorage,
  },
  "image/png": {
    conversation: resizeAndUploadToFileStorage,
  },
  "text/comma-separated-values": {
    conversation: storeRawText,
  },
  "text/csv": {
    conversation: storeRawText,
  },
  "text/markdown": {
    conversation: storeRawText,
  },
  "text/plain": {
    conversation: storeRawText,
  },
  "text/tab-separated-values": {
    conversation: storeRawText,
  },
  "text/tsv": {
    conversation: storeRawText,
  },
};

export async function maybeApplyPreProcessing(
  auth: Authenticator,
  file: FileResource
): Promise<Result<undefined, Error>> {
  const contentTypeProcessing = processingPerContentType[file.contentType];
  if (!contentTypeProcessing) {
    await file.markAsReady();

    return new Ok(undefined);
  }

  const processing = contentTypeProcessing[file.useCase];
  if (processing) {
    const res = await processing(auth, file);
    if (res.isErr()) {
      await file.markAsFailed();

      return res;
    }
  }

  await file.markAsReady();

  return new Ok(undefined);
}
