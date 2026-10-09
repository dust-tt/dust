import { z } from "zod";

export const CHUNK_BYTES = 64 * 1024;
export const MAX_OBJECT_BYTES = 256 * 1024 * 1024;

export class GcsDfsError extends Error {
  constructor(
    readonly reason:
      | "notification_identity_mismatch"
      | "unmapped_source"
      | "object_too_large"
      | "content_size_mismatch"
      | "source_version_mismatch"
      | "metadata_too_large"
      | "invalid_import_token"
      | "response_too_large"
      | "source_cursor_changed"
  ) {
    super(reason);
  }
}

const DecimalSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,19}$/)
  .refine((value) => BigInt(value) <= BigInt("18446744073709551615"));
const NameSchema = z
  .string()
  .min(1)
  .refine((value) => Buffer.byteLength(value) <= 1024);

export const MetadataSchema = z
  .object({
    bucket: z.string().min(1),
    name: NameSchema,
    generation: DecimalSchema,
    metageneration: DecimalSchema,
    size: z.string().regex(/^(0|[1-9][0-9]*)$/),
    updated: z.string().datetime({ offset: true }),
    contentType: z.string().optional(),
  })
  .passthrough();

const AttributesSchema = z.object({
  eventType: z.enum([
    "OBJECT_FINALIZE",
    "OBJECT_METADATA_UPDATE",
    "OBJECT_ARCHIVE",
    "OBJECT_DELETE",
  ]),
  payloadFormat: z.literal("JSON_API_V1"),
  bucketId: z.string().min(1),
  objectId: NameSchema,
  objectGeneration: DecimalSchema,
  notificationConfig: z.string().min(1),
  eventTime: z.string().datetime({ offset: true }),
});

export const MessageSchema = z.object({
  ackId: z.string().min(1),
  message: z.object({
    messageId: z.string().min(1),
    data: z.string().default(""),
    attributes: z.record(z.string()).default({}),
  }),
});
export type Message = z.infer<typeof MessageSchema>;

export const BindingSchema = z.object({
  bucket: z.string().min(1),
  prefix: z.string().refine((value) => value === "" || value.endsWith("/")),
  tenant: z.string().min(1),
  endpoint: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/" &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)))
      );
    }),
  tokenFile: z.string().min(1),
  readers: z.array(z.string().min(1).max(512)).max(128),
  notificationConfigs: z.array(z.string().min(1)).min(1),
});
export type Binding = z.infer<typeof BindingSchema>;

export const ConfigSchema = z
  .object({
    pubsubEmulatorHost: z
      .string()
      .regex(/^(127\.0\.0\.1|localhost|\[::1\]):[0-9]{1,5}$/)
      .refine((value) => {
        const port = Number(value.slice(value.lastIndexOf(":") + 1));
        return port >= 1 && port <= 65535;
      })
      .optional(),
    subscription: z.string().regex(/^projects\/[^/]+\/subscriptions\/[^/]+$/),
    concurrency: z.number().int().min(1).max(64).default(8),
    leaseSeconds: z.number().int().min(30).max(600).default(60),
    requestTimeoutMs: z.number().int().min(1000).max(120_000).default(30_000),
    bindings: z.array(BindingSchema).min(1).max(1024),
  })
  .superRefine((value, context) => {
    const sorted = [...value.bindings].sort((a, b) =>
      a.bucket < b.bucket
        ? -1
        : a.bucket > b.bucket
          ? 1
          : a.prefix < b.prefix
            ? -1
            : a.prefix > b.prefix
              ? 1
              : 0
    );
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (
        previous.bucket === current.bucket &&
        current.prefix.startsWith(previous.prefix)
      ) {
        context.addIssue({
          code: "custom",
          message: "Source bindings overlap",
        });
      }
    }
  });
export type WorkerConfig = z.infer<typeof ConfigSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type Cursor = {
  generation: string;
  metageneration: string;
  deleted: boolean;
};
export type Source = { bucket: string; name: string };
export type Publication = Source &
  Cursor & {
    tenant: string;
    expected: Cursor | null;
    size: number;
    chunks: string[];
    readers: string[];
    mtime_ms: number;
    metadata: Metadata;
  };
export const CursorSchema = z.object({
  generation: DecimalSchema,
  metageneration: DecimalSchema,
  deleted: z.boolean(),
});

export function sameCursor(left: Cursor, right: Cursor): boolean {
  return (
    left.generation === right.generation &&
    left.deleted === right.deleted &&
    (left.deleted || left.metageneration === right.metageneration)
  );
}

export function parseNotification(message: Message, bindings: Binding[]) {
  const attributes = AttributesSchema.parse(message.message.attributes);
  const metadata = MetadataSchema.parse(
    JSON.parse(Buffer.from(message.message.data, "base64").toString("utf8"))
  );
  if (
    metadata.bucket !== attributes.bucketId ||
    metadata.name !== attributes.objectId ||
    metadata.generation !== attributes.objectGeneration
  ) {
    throw new GcsDfsError("notification_identity_mismatch");
  }
  const binding = bindings.find(
    (candidate) =>
      candidate.bucket === metadata.bucket &&
      metadata.name.startsWith(candidate.prefix) &&
      candidate.notificationConfigs.includes(attributes.notificationConfig)
  );
  if (!binding) {
    throw new GcsDfsError("unmapped_source");
  }
  return {
    binding,
    metadata,
    cursor: {
      generation: metadata.generation,
      metageneration: metadata.metageneration,
      deleted:
        attributes.eventType === "OBJECT_DELETE" ||
        attributes.eventType === "OBJECT_ARCHIVE",
    },
  };
}
