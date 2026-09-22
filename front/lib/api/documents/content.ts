import type { NativeDocument } from "@app/types/documents";
import { DOCUMENT_MAX_BYTES, NativeDocumentSchema } from "@app/types/documents";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  parseDocumentContent,
  serializeDocumentMarkdown,
} from "@dust-tt/sparkle/document";

export const importDocumentMarkdown = (
  markdown: string
): NativeDocument | null => {
  const parsed = parseDocumentContent(markdown, "markdown");
  if (!parsed.ok) {
    return null;
  }

  return parseNativeDocument(
    JSON.stringify({
      format: "dust-document",
      formatVersion: 1,
      schemaVersion: 1,
      content: parsed.content,
    })
  );
};

/**
 * @cc [owner:flvndvd,label:security] native-document-source-decoding
 * Native source bytes MUST fit the file limit and decode as UTF-8 without replacement.
 * Invalid bytes MUST return an error before parsing or editing can change the source.
 */
export const decodeNativeDocumentSource = (
  bytes: Uint8Array
): Result<string, Error> => {
  if (bytes.byteLength > DOCUMENT_MAX_BYTES) {
    return new Err(new Error("This document exceeds the 512 KiB size limit."));
  }

  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let source: string;
  try {
    source = decoder.decode(bytes);
  } catch {
    return new Err(new Error("This document is not valid UTF-8."));
  }
  return new Ok(source);
};

/**
 * @cc [owner:flvndvd,label:security] native-document-shared-validation
 * Native source MUST fit the UTF-8 byte limit before parsing. Its complete content
 * MUST pass Sparkle's document parser. Invalid input MUST return an error without
 * dropping fields, executing content, or changing the original source.
 */
export const validateNativeDocument = (
  source: string
): Result<NativeDocument, Error> => {
  if (
    source.length > DOCUMENT_MAX_BYTES ||
    new TextEncoder().encode(source).byteLength > DOCUMENT_MAX_BYTES
  ) {
    return new Err(new Error("This document exceeds the 512 KiB size limit."));
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return new Err(new Error("This document is not valid JSON."));
  }

  const parsed = NativeDocumentSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return new Err(
      new Error(
        `Invalid native document at ${issue?.path.join(".") || "root"}: ${issue?.message ?? "unsupported envelope"}.`
      )
    );
  }

  // A bounded JSON string can still exceed JSON.stringify's recursion limit.
  // Keep that failure inside the validation boundary before Sparkle's depth check.
  let contentSource: string;
  try {
    contentSource = JSON.stringify(parsed.data.content);
  } catch {
    return new Err(new Error("This document has too many nested blocks."));
  }
  const content = parseDocumentContent(contentSource, "json");
  return content.ok ? new Ok(parsed.data) : new Err(new Error(content.error));
};

export const parseNativeDocument = (source: string): NativeDocument | null => {
  const validated = validateNativeDocument(source);
  return validated.isOk() ? validated.value : null;
};

export const exportDocumentMarkdown = (
  document: NativeDocument
): string | null => {
  const parsed = parseDocumentContent(JSON.stringify(document.content), "json");
  return parsed.ok ? serializeDocumentMarkdown(parsed.content) : null;
};
