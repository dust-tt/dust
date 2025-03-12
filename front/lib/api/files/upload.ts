import type {
  FileUseCase,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import {
  assertNever,
  Err,
  isSupportedDelimitedTextContentType,
  isSupportedImageContentType,
  isTextExtractionSupportedContentType,
  Ok,
  TextExtraction,
} from "@dust-tt/types";
import type { IncomingMessage } from "http";
import sharp from "sharp";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import config from "@app/lib/api/config";
import { parseUploadRequest } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

const UPLOAD_DELAY_AFTER_CREATION_MS = 1000 * 60 * 1; // 1 minute.

// Upload to public bucket.

const uploadToPublicBucket: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const readStream = file.getReadStream({
    auth,
    version: "original",
  });
  const writeStream = file.getWriteStream({
    auth,
    version: "public",
  });
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
      "Failed to upload file to public url."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";

    return new Err(
      new Error(`Failed uploading to public bucket. ${errorMessage}`)
    );
  }
};

// Images processing.

const resizeAndUploadToFileStorage: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const readStream = file.getReadStream({
    auth,
    version: "original",
  });

  // Anthropic https://docs.anthropic.com/en/docs/build-with-claude/vision#evaluate-image-size
  // OpenAI https://platform.openai.com/docs/guides/vision#calculating-costs

  // Anthropic recommends <= 1568px on any side.
  // OpenAI recommends <= 2048px on the longuest side, 768px on the shortest side.

  // Resize the image, preserving the aspect ratio based on the longest side compatible with both
  // models. In case of GPT, it might incure a resize on their side as well but doing the math here
  // would mean downloading the file first instead of streaming it.
  const resizedImageStream = sharp().resize(1568, 1568, {
    fit: sharp.fit.inside, // Ensure longest side is 1568px.
    withoutEnlargement: true, // Avoid upscaling if image is smaller than 1568px.
  });

  const writeStream = file.getWriteStream({
    auth,
    version: "processed",
  });

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

const extractTextFromFileAndUpload: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  try {
    if (!isTextExtractionSupportedContentType(file.contentType)) {
      throw new Error(
        `Cannot extract text from this file type ${file.contentType}. Action: check than caller filters out unsupported file types.`
      );
    }
    const readStream = file.getReadStream({
      auth,
      version: "original",
    });
    const writeStream = file.getWriteStream({ auth, version: "processed" });

    const processedStream = await new TextExtraction(
      config.getTextExtractionUrl(),
      { enableOcr: true, logger }
    ).fromStream(readStream, file.contentType);

    await pipeline(processedStream, writeStream);

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to extract text from File."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";

    return new Err(
      new Error(`Failed extracting text from File. ${errorMessage}`)
    );
  }
};

// Other text files processing.

// We don't apply any processing to these files, we just store the raw text.
const storeRawText: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const readStream = file.getReadStream({
    auth,
    version: "original",
  });
  const writeStream = file.getWriteStream({
    auth,
    version: "processed",
  });

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

type ProcessingFunction = (
  auth: Authenticator,
  file: FileResource
) => Promise<Result<undefined, Error>>;

const getProcessingFunction = ({
  contentType,
  useCase,
}: {
  contentType: SupportedFileContentType;
  useCase: FileUseCase;
}): ProcessingFunction | undefined => {
  if (isSupportedImageContentType(contentType)) {
    if (useCase === "conversation") {
      return resizeAndUploadToFileStorage;
    } else if (useCase === "avatar") {
      return uploadToPublicBucket;
    }
    return undefined;
  }

  if (isSupportedDelimitedTextContentType(contentType)) {
    if (
      contentType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      contentType === "application/vnd.ms-excel"
    ) {
      // We use tika to extract from excel files, it will turn into a html table
      // We will upsert from the html table later
      return extractTextFromFileAndUpload;
    } else if (
      [
        "conversation",
        "upsert_document",
        "upsert_table",
        "tool_output",
      ].includes(useCase)
    ) {
      return storeRawText;
    }
    return undefined;
  }

  switch (contentType) {
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.ms-powerpoint":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    case "application/pdf":
      if (["conversation", "upsert_document"].includes(useCase)) {
        return extractTextFromFileAndUpload;
      }
      break;
    case "text/plain":
    case "text/markdown":
    case "text/html":
    case "text/xml":
    case "text/calendar":
    case "text/css":
    case "text/javascript":
    case "text/typescript":
    case "application/json":
    case "application/xml":
    case "application/x-sh":
    case "text/x-sh":
    case "text/x-python":
    case "text/x-python-script":
    case "application/x-yaml":
    case "text/yaml":
    case "text/vnd.yaml":
    case "text/x-c":
    case "text/x-csharp":
    case "text/x-java-source":
    case "text/x-php":
    case "text/x-ruby":
    case "text/x-sql":
    case "text/x-swift":
    case "text/x-rust":
    case "text/x-go":
    case "text/x-kotlin":
    case "text/x-scala":
    case "text/x-groovy":
    case "text/x-perl":
    case "text/x-perl-script":
      if (
        ["conversation", "upsert_document", "tool_output"].includes(useCase)
      ) {
        return storeRawText;
      }
      break;
    case "text/vnd.dust.attachment.slack.thread":
      if (useCase === "conversation") {
        return storeRawText;
      }
      break;
    case "application/vnd.dust.section.json":
      if (useCase === "tool_output") {
        return storeRawText;
      }
      break;
    default:
      assertNever(contentType);
  }

  return undefined;
};

export const isUploadSupported = (arg: {
  contentType: SupportedFileContentType;
  useCase: FileUseCase;
}): boolean => {
  const processing = getProcessingFunction(arg);
  return !!processing;
};

const maybeApplyProcessing: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const processing = getProcessingFunction(file);
  if (!processing) {
    return new Err(
      new Error(
        `Processing not supported for content type ${file.contentType} and use case ${file.useCase}`
      )
    );
  }

  const res = await processing(auth, file);
  if (res.isErr()) {
    return res;
  } else {
    return new Ok(undefined);
  }
};

export async function processAndStoreFile(
  auth: Authenticator,
  {
    file,
    reqOrString,
  }: { file: FileResource; reqOrString: IncomingMessage | string }
): Promise<
  Result<
    FileResource,
    Omit<DustError, "code"> & {
      code:
        | "internal_server_error"
        | "invalid_request_error"
        | "file_too_large"
        | "file_type_not_supported"
        | "file_is_empty";
    }
  >
> {
  if (file.isReady || file.isFailed) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "The file has already been uploaded or the upload has failed.",
    });
  }

  if (file.createdAt.getTime() + UPLOAD_DELAY_AFTER_CREATION_MS < Date.now()) {
    await file.markAsFailed();
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "File upload has expired. Create a new file.",
    });
  }

  if (typeof reqOrString === "string") {
    await pipeline(
      Readable.from(reqOrString),
      file.getWriteStream({ auth, version: "original" })
    );
  } else {
    const r = await parseUploadRequest(
      file,
      reqOrString,
      file.getWriteStream({ auth, version: "original" })
    );
    if (r.isErr()) {
      await file.markAsFailed();
      return r;
    }
  }

  const processingRes = await maybeApplyProcessing(auth, file);
  if (processingRes.isErr()) {
    await file.markAsFailed();

    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: `Failed to process the file : ${processingRes.error}`,
    });
  }

  await file.markAsReady();
  return new Ok(file);
}
