import { z } from "zod";

import { liveAgentSchema } from "@app/types/collab";

/**
 * Agents change a live document through the collab server's internal routes: they read the
 * session's source, change it, then write it back conditional on the source they read.
 */

/** Where the collab server mounts the routes only reached from inside the cluster. */
export const COLLAB_INTERNAL_ROUTES_PREFIX = "/internal";
export const COLLAB_SOURCE_READ_PATH = "/documents/read";
export const COLLAB_SOURCE_WRITE_PATH = "/documents/write";

export const collabSourceReadRequestSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1).optional(),
  canonicalPath: z.string().min(1),
  agent: liveAgentSchema.optional(),
});

export type CollabSourceReadRequest = z.infer<
  typeof collabSourceReadRequestSchema
>;

/** What the collab server reports of a live document an agent wants to change. */
export const collabSourceReadResponseSchema = z.discriminatedUnion("open", [
  z.object({ open: z.literal(false) }),
  z.object({ open: z.literal(true), source: z.string() }),
]);

export type CollabSourceReadResponse = z.infer<
  typeof collabSourceReadResponseSchema
>;

export const COLLAB_SOURCE_WRITE_RESULTS = [
  "written",
  "changed",
  "closed",
  "busy",
] as const;

/** How long a write may wait for its turn on the collab server, kept below its caller's timeout. */
export const COLLAB_SOURCE_WRITE_WAIT_MS = 5 * 1000;

export type CollabSourceWriteResult =
  (typeof COLLAB_SOURCE_WRITE_RESULTS)[number];

export const collabSourceWriteRequestSchema =
  collabSourceReadRequestSchema.extend({
    userId: z.string().min(1),
    base: z.string(),
    source: z.string(),
  });

export type CollabSourceWriteRequest = z.infer<
  typeof collabSourceWriteRequestSchema
>;

export const collabSourceWriteResponseSchema = z.discriminatedUnion("result", [
  z.object({ result: z.enum(COLLAB_SOURCE_WRITE_RESULTS) }),
  z.object({ result: z.literal("refused"), message: z.string() }),
]);

export type CollabSourceWriteResponse = z.infer<
  typeof collabSourceWriteResponseSchema
>;
