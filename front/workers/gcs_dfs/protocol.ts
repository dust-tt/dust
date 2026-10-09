import { createHash } from "node:crypto";
import { z } from "zod";

import { DFS_OBJECT_ID_REGEX } from "@app/types/dfs";

export const CHUNK_BYTES = 64 * 1024;
export const MAX_OBJECT_BYTES = 256 * 1024 * 1024;

export class GcsDfsError extends Error {
  constructor(
    readonly reason:
      | "notification_identity_mismatch"
      | "ordering_key_mismatch"
      | "missing_workspace"
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
    orderingKey: z.string().optional(),
  }),
});
export type Message = z.infer<typeof MessageSchema>;

export const RoutingBindingSchema = z
  .object({
    bucket: z.string().min(1),
    prefix: z.string().refine((value) => value === "" || value.endsWith("/")),
    workspaceId: z.string().min(1).max(512),
    notificationConfigs: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type RoutingBinding = z.infer<typeof RoutingBindingSchema>;

export const BindingSchema = RoutingBindingSchema.extend({
  workspaceId: z.string().min(1).max(512).optional(),
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
  directoryId: z.string().regex(DFS_OBJECT_ID_REGEX),
  stagingDirectoryId: z.string().regex(DFS_OBJECT_ID_REGEX),
  writerSubject: z.string().min(1).max(512),
  readers: z.array(z.string().min(1).max(512)).max(128),
  notificationConfigs: z.array(z.string().min(1)).min(1),
});
export type Binding = z.infer<typeof BindingSchema>;

export const TransportConfigSchema = z
  .object({
    pubsubEmulatorHost: z
      .string()
      .regex(/^(127\.0\.0\.1|localhost|\[::1\]):[0-9]{1,5}$/)
      .refine((value) => {
        const port = Number(value.slice(value.lastIndexOf(":") + 1));
        return port >= 1 && port <= 65535;
      })
      .optional(),
    pubsubEndpoint: z
      .string()
      .regex(/^https:\/\/(?:[a-z][a-z0-9-]*-)?pubsub\.googleapis\.com$/)
      .default("https://pubsub.googleapis.com"),
    subscription: z.string().regex(/^projects\/[^/]+\/subscriptions\/[^/]+$/),
    concurrency: z.number().int().min(1).max(64).default(8),
    leaseSeconds: z.number().int().min(30).max(600).default(60),
    requestTimeoutMs: z.number().int().min(1000).max(120_000).default(30_000),
    healthPort: z.number().int().min(1).max(65535).default(3001),
    drainTimeoutMs: z.number().int().min(1000).max(600_000).default(60_000),
    livenessTimeoutMs: z
      .number()
      .int()
      .min(30_000)
      .max(900_000)
      .default(300_000),
    environment: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,64}$/)
      .default("development"),
    cell: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,64}$/)
      .default("local"),
  })
  .strict();
export type TransportConfig = z.infer<typeof TransportConfigSchema>;

function validateBindings(
  value: { bindings: { bucket: string; prefix: string }[] },
  context: z.RefinementCtx
) {
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
      context.addIssue({ code: "custom", message: "Source bindings overlap" });
    }
  }
}

function validateRegion(value: TransportConfig, context: z.RefinementCtx) {
  if (
    !value.pubsubEmulatorHost &&
    value.pubsubEndpoint === "https://pubsub.googleapis.com"
  ) {
    context.addIssue({
      code: "custom",
      message: "Ordered delivery requires a regional Pub/Sub endpoint",
    });
  }
}

export const ConfigSchema = TransportConfigSchema.extend({
  orderedDelivery: z.boolean().default(false),
  bindings: z.array(BindingSchema).min(1).max(1024),
}).superRefine((value, context) => {
  validateBindings(value, context);
  const directories = new Set<string>();
  for (const binding of value.bindings) {
    for (const id of [binding.directoryId, binding.stagingDirectoryId]) {
      const directory = JSON.stringify([binding.tenant, id]);
      if (directories.has(directory)) {
        context.addIssue({
          code: "custom",
          message: "Import directories must be exclusive to one binding",
        });
      }
      directories.add(directory);
    }
    if (
      binding.directoryId === binding.stagingDirectoryId ||
      binding.readers.includes(binding.writerSubject)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Import directories and writer/reader subjects must be distinct",
      });
    }
  }
  if (value.orderedDelivery) {
    validateRegion(value, context);
    if (value.bindings.some((binding) => !binding.workspaceId)) {
      context.addIssue({
        code: "custom",
        message: "Ordered delivery requires workspace bindings",
      });
    }
  }
});

export const RelayConfigSchema = TransportConfigSchema.extend({
  topic: z.string().regex(/^projects\/[^/]+\/topics\/[^/]+$/),
  bindings: z.array(RoutingBindingSchema).min(1).max(1024),
}).superRefine((value, context) => {
  validateBindings(value, context);
  validateRegion(value, context);
});
export type RelayConfig = z.infer<typeof RelayConfigSchema>;
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

export function parseNotification<
  T extends Pick<Binding, "bucket" | "prefix" | "notificationConfigs">,
>(message: Message, bindings: T[]) {
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
  const matches = bindings.filter(
    (candidate) =>
      candidate.bucket === metadata.bucket &&
      metadata.name.startsWith(candidate.prefix) &&
      candidate.notificationConfigs.includes(attributes.notificationConfig)
  );
  if (matches.length !== 1) {
    throw new GcsDfsError("unmapped_source");
  }
  return {
    binding: matches[0],
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

export function objectOrderingKey(
  workspaceId: string,
  objectName: string
): string {
  return `gcs-workspace-object-v1:${createHash("sha256")
    .update(JSON.stringify([workspaceId, objectName]), "utf8")
    .digest("hex")}`;
}

export function workerOrderingKey(
  message: Message,
  config: WorkerConfig
): string {
  const { binding, metadata } = parseNotification(message, config.bindings);
  if (!config.orderedDelivery) {
    return JSON.stringify([metadata.bucket, metadata.name]);
  }
  if (!binding.workspaceId) {
    throw new GcsDfsError("missing_workspace");
  }
  const key = objectOrderingKey(binding.workspaceId, metadata.name);
  if (message.message.orderingKey !== key) {
    throw new GcsDfsError("ordering_key_mismatch");
  }
  return key;
}

export function projectionName(source: Source): string {
  return createHash("sha256")
    .update(JSON.stringify([source.bucket, source.name]))
    .digest("hex");
}
