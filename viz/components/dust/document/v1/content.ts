import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import type {
  FrameDocumentResult,
  FrameDocumentSnapshot,
} from "@viz/app/types";
import { z } from "zod";

const DOCUMENT_MAX_BYTES = 512 * 1024;

// Mirrors the native file envelope in front/types/documents.ts.
const NativeDocumentSchema = z
  .object({
    format: z.literal("dust-document"),
    formatVersion: z.literal(1),
    schemaVersion: z.literal(1),
    content: z.unknown(),
  })
  .strict();

export type NativeDocumentEnvelope = z.infer<typeof NativeDocumentSchema>;

export const parseDocumentFile = (
  source: string
): NativeDocumentEnvelope | null => {
  if (new TextEncoder().encode(source).byteLength > DOCUMENT_MAX_BYTES) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }
  const result = NativeDocumentSchema.safeParse(value);
  return result.success && result.data.content !== undefined
    ? result.data
    : null;
};

/**
 * @cc [owner:flvndvd,label:security] frame-document-shared-read-only
 * Cache-backed documents MUST remain read-only and MUST NOT fall back to private RPC.
 * Stored content MUST pass Sparkle Document validation before editing or rendering.
 */
export const loadDocumentFile = async (
  dataAPI: VisualizationDataAPI,
  src: string
): Promise<FrameDocumentResult<FrameDocumentSnapshot>> => {
  if (!src.startsWith("./") || !src.endsWith(".dustdoc")) {
    return {
      ok: false,
      error: "Use a document file inside this Frame, such as ./intro.dustdoc.",
    };
  }
  if (dataAPI.documentFiles) {
    return dataAPI.documentFiles.load(src);
  }
  const file = await dataAPI.fetchFile(src);
  if (!file || file.size > DOCUMENT_MAX_BYTES) {
    return { ok: false, error: "This document is unavailable." };
  }
  return {
    ok: true,
    value: { source: await file.text(), revision: "", canEdit: false },
  };
};
