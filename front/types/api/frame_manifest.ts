import {
  DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE,
  DEFAULT_SANDBOX_FUNCTION_STAKE,
  SANDBOX_DATABASE_NAME_REGEX,
  SANDBOX_FUNCTION_EXECUTION_MODES,
  SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX,
  SANDBOX_FUNCTION_STAKES,
} from "@app/types/api/sandbox_functions";
import { normalizeEgressPolicyDomains } from "@app/types/sandbox/egress_policy";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const FRAME_MANIFEST_FILE = "manifest.json";
export const FRAME_MANIFEST_VERSION = 1;
export const FRAME_DEFAULT_UI_ENTRY_POINT = "index.tsx";
export const MAX_FRAME_NAME_LENGTH = 128;
export const MAX_FRAME_FUNCTION_NAME_LENGTH = 128;
export const MAX_FRAME_FUNCTION_DESCRIPTION_LENGTH = 255;
// Each schema reconcile can take 60 seconds and runs under the 10-minute publication lease.
export const MAX_FRAME_DATABASE_COUNT = 4;
// Matches the pending-request cap of a single egress policy scope.
export const MAX_FRAME_DOMAIN_COUNT = 50;
export const FRAME_DATABASE_NAME_REGEX = SANDBOX_DATABASE_NAME_REGEX;

/** Manifest paths are always relative to the Frame source folder. */
export function isSafeFrameRelativePath(path: string): boolean {
  if (path.startsWith("/") || path.includes("\\")) {
    return false;
  }

  const segments = path.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== ".."
  );
}

const FrameRelativePathSchema = z
  .string()
  .min(1)
  .refine(isSafeFrameRelativePath, {
    message:
      "Path must be relative to the Frame folder, using forward slashes and no '.', '..' or empty segments.",
  });

export const FrameFunctionManifestSchema = z.object({
  name: z
    .string()
    .max(MAX_FRAME_FUNCTION_NAME_LENGTH)
    .regex(SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX, {
      message:
        "Function name must be lowercase alphanumeric with single hyphen separators.",
    }),
  description: z.string().max(MAX_FRAME_FUNCTION_DESCRIPTION_LENGTH),
  entryPoint: FrameRelativePathSchema,
  executionMode: z
    .enum(SANDBOX_FUNCTION_EXECUTION_MODES)
    .default(DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE),
  defaultStake: z
    .enum(SANDBOX_FUNCTION_STAKES)
    .default(DEFAULT_SANDBOX_FUNCTION_STAKE),
});

export const FrameDatabaseManifestSchema = z.object({
  name: z.string().regex(FRAME_DATABASE_NAME_REGEX, {
    message:
      "Database name must start with a lowercase letter and contain only lowercase letters, digits, and underscores.",
  }),
  schema: FrameRelativePathSchema,
});

// Exact domains or `*.example.com` wildcards the Frame's functions reach at
// runtime. Publishing files each one as an egress request for admin review.
const FrameDomainsSchema = z
  .array(z.string())
  .max(MAX_FRAME_DOMAIN_COUNT)
  .default([])
  .transform((domains, context) => {
    const normalized = normalizeEgressPolicyDomains(domains);
    if (normalized.isErr()) {
      context.addIssue({ code: "custom", message: normalized.error.message });
      return z.NEVER;
    }
    return normalized.value;
  });

export const FrameSourceManifestSchema = z
  .object({
    version: z.literal(FRAME_MANIFEST_VERSION),
    name: z.string().min(1).max(MAX_FRAME_NAME_LENGTH),
    description: z.string(),
    uiEntryPoint: FrameRelativePathSchema.optional(),
    functions: z.array(FrameFunctionManifestSchema).default([]),
    databases: z
      .array(FrameDatabaseManifestSchema)
      .max(MAX_FRAME_DATABASE_COUNT)
      .default([]),
    domains: FrameDomainsSchema,
  })
  .superRefine((manifest, context) => {
    const functionNames = new Set<string>();

    manifest.functions.forEach((fn, index) => {
      if (functionNames.has(fn.name)) {
        context.addIssue({
          code: "custom",
          message: `Function name '${fn.name}' must be unique.`,
          path: ["functions", index, "name"],
        });
      }
      functionNames.add(fn.name);
    });

    const databaseNames = new Set<string>();
    manifest.databases.forEach((database, index) => {
      if (databaseNames.has(database.name)) {
        context.addIssue({
          code: "custom",
          message: `Database name '${database.name}' must be unique.`,
          path: ["databases", index, "name"],
        });
      }
      databaseNames.add(database.name);
    });
  });

export const FrameManifestSchema = FrameSourceManifestSchema.transform(
  (manifest) => ({
    ...manifest,
    uiEntryPoint: manifest.uiEntryPoint ?? FRAME_DEFAULT_UI_ENTRY_POINT,
  })
);

export type FrameManifest = z.infer<typeof FrameManifestSchema>;

export function parseFrameManifest(
  buffer: Buffer
): Result<FrameManifest, string> {
  let json: unknown;
  try {
    json = JSON.parse(buffer.toString("utf-8"));
  } catch (err) {
    return new Err(
      `${FRAME_MANIFEST_FILE} is not valid JSON: ${normalizeError(err).message}`
    );
  }

  const validation = FrameManifestSchema.safeParse(json);
  if (!validation.success) {
    return new Err(fromError(validation.error).toString());
  }

  return new Ok(validation.data);
}
