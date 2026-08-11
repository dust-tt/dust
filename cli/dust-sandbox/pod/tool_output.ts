// Resolution of tool output text content.
//
// Tool outputs above front's offload threshold are not delivered inline: the
// full content is archived as a pod file and the inline text is replaced by a
// snippet ending with a human-facing "[Full content archived at <path>]"
// sentence. Offloaded blocks carry a machine-readable descriptor under the
// "tt.dust/offload" key of their `_meta` (front owns the write side; the
// descriptor shape is append-only). `resolveToolTextContent()` is the read
// side: inline text passthrough when no descriptor is present, otherwise the
// archived file is read back from the gcsfuse mount with a bounded retry
// covering mount metadata-cache staleness. Never parse the snippet text or
// the archive sentence: the descriptor is the contract.

import { readFile } from "node:fs/promises";
import { z } from "zod";

/**
 * Key of the offload descriptor in a content block's `_meta`. Owned by front
 * (`TOOL_OUTPUT_OFFLOAD_META_KEY` in `front/lib/actions/action_output_limits.ts`);
 * this is the in-sandbox copy of the wire contract.
 */
export const TOOL_OUTPUT_OFFLOAD_META_KEY = "tt.dust/offload";

/**
 * Absolute in-sandbox directory the scoped file mounts live under: a
 * descriptor's `fullContentPath` (e.g. "pod-{pId}/.tool_outputs/{slug}/{file}")
 * resolves to `/files/pod-{pId}/...`.
 */
const MOUNT_ROOT_DIR = "/files";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_MS = 1000;

const offloadDescriptorSchema = z.object({
  fullContentPath: z.string().min(1),
  totalBytes: z.number(),
  contentType: z.string(),
});

export type ToolOutputOffloadDescriptor = z.infer<
  typeof offloadDescriptorSchema
>;

// Lenient view of a content block as printed by `dsbx tools exec --json`:
// only the fields resolution needs, unknown fields ignored.
const contentBlockSchema = z.object({
  text: z.string().optional(),
  resource: z
    .object({
      text: z.string().optional(),
    })
    .optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export class ToolOutputResolutionError extends Error {
  override readonly name = "ToolOutputResolutionError";
}

export interface ResolveToolTextContentOptions {
  /**
   * Directory the scoped file mounts live under (default "/files").
   * Overridable for tests; production code should not set it.
   */
  mountRootDir?: string;
  /** Read attempts before giving up on an offloaded path (default 5). */
  maxAttempts?: number;
  /** Delay between read attempts (default 1000 ms). */
  retryDelayMs?: number;
}

/**
 * Return the full text content of a tool output content block.
 *
 * - Block without an offload descriptor: the inline text (`text` for text
 *   blocks, `resource.text` for embedded resources) is returned as-is.
 * - Block with an offload descriptor in `_meta`: the archived full content is
 *   read from the mount and returned; the inline snippet is never used.
 *
 * @throws ToolOutputResolutionError when the block carries no text and no
 *   descriptor, when the descriptor is malformed, or when the archived file
 *   cannot be read after the bounded retry (the message names the path).
 */
export async function resolveToolTextContent(
  block: unknown,
  options: ResolveToolTextContentOptions = {}
): Promise<string> {
  const parsedBlock = contentBlockSchema.safeParse(block);
  if (!parsedBlock.success) {
    throw new ToolOutputResolutionError(
      "Tool output block is not a content block object."
    );
  }

  const rawDescriptor = parsedBlock.data._meta?.[TOOL_OUTPUT_OFFLOAD_META_KEY];
  if (rawDescriptor === undefined) {
    const inlineText = parsedBlock.data.text ?? parsedBlock.data.resource?.text;
    if (inlineText === undefined) {
      throw new ToolOutputResolutionError(
        "Tool output block carries no text content and no offload descriptor."
      );
    }
    return inlineText;
  }

  const parsedDescriptor = offloadDescriptorSchema.safeParse(rawDescriptor);
  if (!parsedDescriptor.success) {
    throw new ToolOutputResolutionError(
      `Tool output block carries an invalid offload descriptor under ` +
        `"${TOOL_OUTPUT_OFFLOAD_META_KEY}"; this is a platform contract ` +
        `violation, report it rather than working around it.`
    );
  }

  return readOffloadedContent(parsedDescriptor.data, options);
}

async function readOffloadedContent(
  descriptor: ToolOutputOffloadDescriptor,
  options: ResolveToolTextContentOptions
): Promise<string> {
  const {
    mountRootDir = MOUNT_ROOT_DIR,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;

  const path = descriptor.fullContentPath.startsWith("/")
    ? descriptor.fullContentPath
    : `${mountRootDir}/${descriptor.fullContentPath}`;

  // The archived file is written through the GCS API while this reads through
  // the gcsfuse mount, whose metadata cache can lag behind the write: retry a
  // bounded number of times instead of failing on the first missing read.
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await readFile(path, "utf-8");
    } catch (err) {
      lastError = err;
    }
    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  const reason =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new ToolOutputResolutionError(
    `Could not read the offloaded tool output at ${path} after ` +
      `${maxAttempts} attempts (the file mount can lag behind writes): ${reason}`
  );
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
