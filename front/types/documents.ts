import { z } from "zod";

export const DOCUMENT_MAX_BYTES = 512 * 1024;
export const documentContentType = "application/vnd.dust.document+json";

interface DocumentContentEnvelope {
  type: "doc";
  [key: string]: unknown;
}

const isDocumentContentEnvelope = (
  value: unknown
): value is DocumentContentEnvelope =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  "type" in value &&
  value.type === "doc";

/**
 * @cc [owner:flvndvd,label:security] native-document-envelope
 * Native documents MUST reject unknown envelope fields and unsupported versions.
 * Content MUST reach the shared editor validator unchanged, including unknown keys.
 */
export const NativeDocumentSchema = z
  .object({
    format: z.literal("dust-document"),
    formatVersion: z.literal(1),
    schemaVersion: z.literal(1),
    content: z.custom<DocumentContentEnvelope>(isDocumentContentEnvelope),
  })
  .strict();

export type NativeDocument = z.infer<typeof NativeDocumentSchema>;

export interface CanonicalDocumentSnapshot {
  canonicalPath: string;
  document: NativeDocument;
  revision: string;
  canEdit: boolean;
}
