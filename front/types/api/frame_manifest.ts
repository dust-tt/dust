import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import { SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX } from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const FRAME_MANIFEST_FILE = "manifest.json";
export const FRAME_MANIFEST_VERSION = 1;
export const FRAME_DEFAULT_UI_ENTRY_POINT = "index.tsx";
export const MAX_FRAME_NAME_LENGTH = 128;
export const MAX_FRAME_FUNCTION_NAME_LENGTH = 128;

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

const JsonSchemaSchema = z.custom<JSONSchema>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    validateJsonSchema(value).isValid,
  { message: "Invalid JSON schema" }
);

export const FrameFunctionManifestSchema = z.object({
  name: z
    .string()
    .max(MAX_FRAME_FUNCTION_NAME_LENGTH)
    .regex(SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX, {
      message:
        "Function name must be lowercase alphanumeric with single hyphen separators.",
    }),
  description: z.string(),
  entryPoint: FrameRelativePathSchema,
  inputSchema: JsonSchemaSchema,
  outputSchema: JsonSchemaSchema,
});

export const FrameSourceManifestSchema = z
  .object({
    version: z.literal(FRAME_MANIFEST_VERSION),
    name: z.string().min(1).max(MAX_FRAME_NAME_LENGTH),
    description: z.string(),
    uiEntryPoint: FrameRelativePathSchema.optional(),
    functions: z.array(FrameFunctionManifestSchema).default([]),
  })
  .superRefine((manifest, context) => {
    const names = new Set<string>();

    manifest.functions.forEach((fn, index) => {
      if (names.has(fn.name)) {
        context.addIssue({
          code: "custom",
          message: `Function name '${fn.name}' must be unique.`,
          path: ["functions", index, "name"],
        });
      }
      names.add(fn.name);
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
