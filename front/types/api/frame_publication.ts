import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import {
  FrameDatabaseManifestSchema,
  FrameFunctionManifestSchema,
  FrameManifestSchema,
  isSafeFrameRelativePath,
} from "@app/types/api/frame_manifest";
import { SANDBOX_FUNCTION_USER_IDENTITY_POLICIES } from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const FRAME_PUBLICATION_FILE = "publication.json";
export const FRAME_PUBLICATION_SCHEMA_VERSION = 1;

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const RelativePathSchema = z.string().refine(isSafeFrameRelativePath);
const JsonSchemaSchema = z.custom<JSONSchema>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    validateJsonSchema(value).isValid,
  { message: "Invalid JSON schema" }
);

export const FramePublicationDescriptorSchema = z
  .object({
    schemaVersion: z.literal(FRAME_PUBLICATION_SCHEMA_VERSION),
    manifest: FrameManifestSchema,
    publishedAt: z.string().datetime({ offset: true }),
    publisherId: z.string().nullable(),
    sourceFiles: z.array(
      z.object({
        path: RelativePathSchema,
        contentSha256: Sha256Schema,
      })
    ),
    ui: z.object({ bundleSha256: Sha256Schema }),
    functions: z.array(
      z.object({
        name: FrameFunctionManifestSchema.shape.name,
        bundleSha256: Sha256Schema,
        userIdentity: z.enum(SANDBOX_FUNCTION_USER_IDENTITY_POLICIES),
        inputSchema: JsonSchemaSchema,
        outputSchema: JsonSchemaSchema,
      })
    ),
    databases: z.array(
      z.object({
        name: FrameDatabaseManifestSchema.shape.name,
        schemaSource: z.string(),
        schemaSha256: Sha256Schema,
      })
    ),
  })
  .superRefine((publication, context) => {
    publication.manifest.functions.forEach((fn, index) => {
      if (publication.functions[index]?.name !== fn.name) {
        context.addIssue({
          code: "custom",
          message: `Missing publication contract for function '${fn.name}'.`,
          path: ["functions", index],
        });
      }
    });
    if (
      publication.functions.length !== publication.manifest.functions.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Publication function contracts must match the manifest.",
        path: ["functions"],
      });
    }

    publication.manifest.databases.forEach((database, index) => {
      if (publication.databases[index]?.name !== database.name) {
        context.addIssue({
          code: "custom",
          message: `Missing publication contract for database '${database.name}'.`,
          path: ["databases", index],
        });
      }
    });
    if (
      publication.databases.length !== publication.manifest.databases.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Publication database contracts must match the manifest.",
        path: ["databases"],
      });
    }

    const sourcePaths = new Set<string>();
    publication.sourceFiles.forEach((sourceFile, index) => {
      if (sourcePaths.has(sourceFile.path)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate source hash for '${sourceFile.path}'.`,
          path: ["sourceFiles", index, "path"],
        });
      }
      sourcePaths.add(sourceFile.path);
    });
  });

export type FramePublicationDescriptor = z.infer<
  typeof FramePublicationDescriptorSchema
>;

export function parseFramePublicationDescriptor(
  buffer: Buffer
): Result<FramePublicationDescriptor, string> {
  let json: unknown;
  try {
    json = JSON.parse(buffer.toString("utf-8"));
  } catch (error) {
    return new Err(
      `${FRAME_PUBLICATION_FILE} is not valid JSON: ${normalizeError(error).message}`
    );
  }

  const validation = FramePublicationDescriptorSchema.safeParse(json);
  if (!validation.success) {
    return new Err(fromError(validation.error).toString());
  }

  return new Ok(validation.data);
}
