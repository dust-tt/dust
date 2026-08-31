import { randomUUID } from "node:crypto";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { withFramePublishLock } from "@app/lib/api/frames/operation_lock";
import { computeAuthorizedFileAccessForShare } from "@app/lib/api/viz/authorized_file_access";
import { emitFrameAuthorizedFilesUpdatedAuditLog } from "@app/lib/api/viz/frame_authorized_files_audit";
import type { Authenticator } from "@app/lib/auth";
import {
  GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { FramePublicationFunctionDefinition } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import {
  isSafeFrameRelativePath,
  parseFrameManifest,
} from "@app/types/api/frame_manifest";
import {
  getFramePublicationFunctionBundlePath,
  getFramePublicationFunctionSchemaPath,
  getFramePublicationManifestPath,
  getFramePublicationSourcePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import type { SandboxFunctionUserIdentityPolicy } from "@app/types/api/sandbox_functions";
import { SANDBOX_FUNCTION_USER_IDENTITY_POLICIES } from "@app/types/api/sandbox_functions";
import type { AllSupportedFileContentType } from "@app/types/files";
import {
  frameContentType,
  frameV2ContentType,
  sandboxFunctionContentType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";

const FRAME_PUBLICATION_UPLOAD_CONCURRENCY = 4;
const FRAME_PUBLICATION_READ_CONCURRENCY = 4;

const jsonSchemaValue = z.custom<JSONSchema>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    validateJsonSchema(value).isValid
);

const FramePublicationFunctionSchemaArtifactSchema = z.object({
  userIdentity: z.enum(SANDBOX_FUNCTION_USER_IDENTITY_POLICIES),
  inputSchema: jsonSchemaValue,
  outputSchema: jsonSchemaValue,
});

export type FramePublicationSourceFile = {
  relativePath: string;
  content: Buffer;
  contentType: AllSupportedFileContentType;
};

export type FramePublicationFunctionArtifact = {
  name: string;
  bundleCode: string;
  userIdentity: SandboxFunctionUserIdentityPolicy;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
};

export class FramePublicationError extends Error {
  constructor(
    readonly code:
      | "invalid_frame"
      | "invalid_function_artifact"
      | "invalid_manifest"
      | "invalid_source"
      | "allowlist_failed"
      | "publication_not_found"
      | "source_not_found"
      | "ui_build_failed"
      | "unauthorized",
    message: string
  ) {
    super(message);
    this.name = "FramePublicationError";
  }
}

export function isFramePublicationError(
  error: unknown
): error is FramePublicationError {
  return error instanceof FramePublicationError;
}

function getFrameIdentity(
  auth: Authenticator,
  frame: FileResource
): Result<{ workspaceId: string; frameId: string }, FramePublicationError> {
  const owner = auth.getNonNullableWorkspace();
  if (!frame.isFrameV2 || frame.workspaceId !== owner.id) {
    return new Err(
      new FramePublicationError(
        "invalid_frame",
        "Frame publication access requires a Frames v2 FileResource from the current workspace."
      )
    );
  }

  return new Ok({ workspaceId: owner.sId, frameId: frame.sId });
}

export async function storeFramePublication(
  auth: Authenticator,
  {
    frame,
    functionArtifacts,
    manifest,
    sourceFiles,
    uiBundleCode,
  }: {
    frame: FileResource;
    functionArtifacts: FramePublicationFunctionArtifact[];
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    uiBundleCode: string;
  }
): Promise<Result<{ publicationId: string }, FramePublicationError>> {
  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const sourcePaths = new Set<string>();
  for (const sourceFile of sourceFiles) {
    if (!isSafeFrameRelativePath(sourceFile.relativePath)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Invalid Frame source path: ${sourceFile.relativePath}`
        )
      );
    }
    if (sourcePaths.has(sourceFile.relativePath)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Duplicate Frame source path: ${sourceFile.relativePath}`
        )
      );
    }
    sourcePaths.add(sourceFile.relativePath);
  }
  if (!sourcePaths.has(manifest.uiEntryPoint)) {
    return new Err(
      new FramePublicationError(
        "invalid_source",
        `Frame UI entry point not found: ${manifest.uiEntryPoint}`
      )
    );
  }
  for (const fn of manifest.functions) {
    if (!sourcePaths.has(fn.entryPoint)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Frame function entry point not found: ${fn.name} (${fn.entryPoint})`
        )
      );
    }
  }
  for (const database of manifest.databases) {
    if (!sourcePaths.has(database.schema)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Frame database schema not found: ${database.name} (${database.schema})`
        )
      );
    }
  }

  const declaredFunctionNames = new Set(
    manifest.functions.map((fn) => fn.name)
  );
  const artifactNames = new Set<string>();
  for (const artifact of functionArtifacts) {
    if (artifactNames.has(artifact.name)) {
      return new Err(
        new FramePublicationError(
          "invalid_function_artifact",
          `Duplicate Frame function artifact: ${artifact.name}`
        )
      );
    }
    if (!declaredFunctionNames.has(artifact.name)) {
      return new Err(
        new FramePublicationError(
          "invalid_function_artifact",
          `Frame function artifact is not declared in the manifest: ${artifact.name}`
        )
      );
    }
    artifactNames.add(artifact.name);
  }
  for (const fn of manifest.functions) {
    if (!artifactNames.has(fn.name)) {
      return new Err(
        new FramePublicationError(
          "invalid_function_artifact",
          `Frame function artifact is missing: ${fn.name}`
        )
      );
    }
  }

  const identity = {
    ...frameIdentity.value,
    publicationId: randomUUID(),
  };
  const storage = getPrivateUploadBucket();

  const publicationFiles = [
    {
      filePath: getFramePublicationUiBundlePath(identity),
      content: uiBundleCode,
      contentType: frameContentType,
    },
    ...sourceFiles.map((sourceFile) => ({
      filePath: getFramePublicationSourcePath({
        ...identity,
        relativePath: sourceFile.relativePath,
      }),
      content: sourceFile.content,
      contentType: sourceFile.contentType,
    })),
    ...functionArtifacts.flatMap((artifact) => [
      {
        filePath: getFramePublicationFunctionBundlePath({
          ...identity,
          functionName: artifact.name,
        }),
        content: artifact.bundleCode,
        contentType: sandboxFunctionContentType,
      },
      {
        filePath: getFramePublicationFunctionSchemaPath({
          ...identity,
          functionName: artifact.name,
        }),
        content: JSON.stringify({
          userIdentity: artifact.userIdentity,
          inputSchema: artifact.inputSchema,
          outputSchema: artifact.outputSchema,
        }),
        contentType: "application/json",
      },
    ]),
  ];

  await concurrentExecutor(
    publicationFiles,
    ({ filePath, content, contentType }) =>
      storage.file(filePath).save(content, {
        contentType,
        preconditionOpts: {
          ifGenerationMatch: GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
        },
      }),
    { concurrency: FRAME_PUBLICATION_UPLOAD_CONCURRENCY }
  );

  // The manifest is the publication commit marker. Readers never observe partial publication data.
  const manifestPath = getFramePublicationManifestPath(identity);
  await storage.file(manifestPath).save(Buffer.from(JSON.stringify(manifest)), {
    contentType: frameV2ContentType,
    preconditionOpts: {
      ifGenerationMatch: GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
    },
  });

  return new Ok({ publicationId: identity.publicationId });
}

export async function loadFramePublicationManifest(
  auth: Authenticator,
  {
    frame,
    publicationId,
  }: {
    frame: FileResource;
    publicationId: string;
  }
): Promise<Result<FrameManifest, FramePublicationError>> {
  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const manifestPath = getFramePublicationManifestPath({
    ...frameIdentity.value,
    publicationId,
  });
  let manifestBuffer: Uint8Array<ArrayBuffer>;
  try {
    manifestBuffer =
      await getPrivateUploadBucket().fetchFileBuffer(manifestPath);
  } catch (error) {
    if (isGCSNotFoundError(error)) {
      return new Err(
        new FramePublicationError(
          "publication_not_found",
          `Frame publication not found: ${publicationId}`
        )
      );
    }
    throw error;
  }

  const manifest = parseFrameManifest(Buffer.from(manifestBuffer));
  if (manifest.isErr()) {
    return new Err(
      new FramePublicationError("invalid_manifest", manifest.error)
    );
  }

  return manifest;
}

async function loadFramePublicationFunctionDefinitions(
  auth: Authenticator,
  {
    frame,
    manifest,
    publicationId,
  }: {
    frame: FileResource;
    manifest: FrameManifest;
    publicationId: string;
  }
): Promise<
  Result<FramePublicationFunctionDefinition[], FramePublicationError>
> {
  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const storage = getPrivateUploadBucket();
  const definitions = await concurrentExecutor(
    manifest.functions,
    async (fn) => {
      const identity = {
        ...frameIdentity.value,
        publicationId,
        functionName: fn.name,
      };
      let bundleCode: string;
      let schemaContent: string;
      try {
        [bundleCode, schemaContent] = await Promise.all([
          storage.fetchFileContent(
            getFramePublicationFunctionBundlePath(identity)
          ),
          storage.fetchFileContent(
            getFramePublicationFunctionSchemaPath(identity)
          ),
        ]);
      } catch (error) {
        if (!isGCSNotFoundError(error)) {
          throw error;
        }
        return new Err(
          new FramePublicationError(
            "publication_not_found",
            `Frame publication function artifact not found: ${fn.name}`
          )
        );
      }

      let schemaJson: unknown;
      try {
        schemaJson = JSON.parse(schemaContent);
      } catch (error) {
        return new Err(
          new FramePublicationError(
            "invalid_function_artifact",
            `Invalid Frame publication function schema for ${fn.name}: ${normalizeError(error).message}`
          )
        );
      }
      const schema =
        FramePublicationFunctionSchemaArtifactSchema.safeParse(schemaJson);
      if (!schema.success) {
        return new Err(
          new FramePublicationError(
            "invalid_function_artifact",
            `Invalid Frame publication function schema for ${fn.name}: ${schema.error.message}`
          )
        );
      }

      return new Ok({
        name: fn.name,
        description: fn.description,
        executionMode: fn.executionMode,
        defaultStake: fn.defaultStake,
        bundleCode,
        ...schema.data,
      });
    },
    { concurrency: FRAME_PUBLICATION_READ_CONCURRENCY }
  );

  const definitionError = definitions.find((definition) => definition.isErr());
  if (definitionError?.isErr()) {
    return definitionError;
  }

  return new Ok(
    definitions.flatMap((definition) =>
      definition.isOk() ? [definition.value] : []
    )
  );
}

export async function activateFramePublication(
  auth: Authenticator,
  {
    frame,
    publicationId,
  }: {
    frame: FileResource;
    publicationId: string;
  }
): Promise<Result<void, FramePublicationError>> {
  const manifest = await loadFramePublicationManifest(auth, {
    frame,
    publicationId,
  });
  if (manifest.isErr()) {
    return manifest;
  }

  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const functionDefinitions = await loadFramePublicationFunctionDefinitions(
    auth,
    { frame, manifest: manifest.value, publicationId }
  );
  if (functionDefinitions.isErr()) {
    return functionDefinitions;
  }

  let uiBundleCode: string;
  try {
    uiBundleCode = await getPrivateUploadBucket().fetchFileContent(
      getFramePublicationUiBundlePath({
        ...frameIdentity.value,
        publicationId,
      })
    );
  } catch (error) {
    if (!isGCSNotFoundError(error)) {
      throw error;
    }
    return new Err(
      new FramePublicationError(
        "publication_not_found",
        `Frame publication UI bundle not found: ${publicationId}`
      )
    );
  }

  await frame.ensureShareableFrame(auth);
  const allowlist = await computeAuthorizedFileAccessForShare(auth, frame, {
    frameContent: uiBundleCode,
  });
  if (allowlist.isErr()) {
    return new Err(
      new FramePublicationError("allowlist_failed", allowlist.error.message)
    );
  }
  const shareScope = await frame.getShareScope();

  await withTransaction(async (transaction) => {
    // Updating the Frame first serializes concurrent activations. None of the
    // new publication state becomes visible until the transaction commits.
    await frame.setActiveFramePublication(publicationId, transaction);
    await frame.persistAuthorizedFileAccess(allowlist.value, { transaction });
    await SandboxFunctionResource.createForFramePublication(
      auth,
      {
        frame,
        functions: functionDefinitions.value,
        publicationId,
      },
      transaction
    );
  });

  emitFrameAuthorizedFilesUpdatedAuditLog(
    auth,
    frame,
    allowlist.value,
    shareScope
  );

  void emitAuditLogEvent({
    auth,
    action: "frame.publication_activated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("frame", {
        sId: frame.sId,
        name: frame.fileName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      frame_id: frame.sId,
      publication_id: publicationId,
    },
  });

  return new Ok(undefined);
}

export async function publishFramePublication(
  auth: Authenticator,
  {
    frame,
    functionArtifacts,
    manifest,
    sourceFiles,
    uiBundleCode,
  }: {
    frame: FileResource;
    functionArtifacts: FramePublicationFunctionArtifact[];
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    uiBundleCode: string;
  }
): Promise<Result<{ publicationId: string }, FramePublicationError>> {
  return withFramePublishLock(frame.sId, async () => {
    const publication = await storeFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest,
      sourceFiles,
      uiBundleCode,
    });
    if (publication.isErr()) {
      return publication;
    }

    const activation = await activateFramePublication(auth, {
      frame,
      publicationId: publication.value.publicationId,
    });
    if (activation.isErr()) {
      return activation;
    }

    return publication;
  });
}

export async function loadFramePublicationSourceFile(
  auth: Authenticator,
  {
    frame,
    publicationId,
    relativePath,
  }: {
    frame: FileResource;
    publicationId: string;
    relativePath: string;
  }
): Promise<Result<Buffer, FramePublicationError>> {
  if (!isSafeFrameRelativePath(relativePath)) {
    return new Err(
      new FramePublicationError(
        "invalid_source",
        `Invalid Frame source path: ${relativePath}`
      )
    );
  }

  const manifest = await loadFramePublicationManifest(auth, {
    frame,
    publicationId,
  });
  if (manifest.isErr()) {
    return manifest;
  }

  const owner = auth.getNonNullableWorkspace();
  const sourcePath = getFramePublicationSourcePath({
    workspaceId: owner.sId,
    frameId: frame.sId,
    publicationId,
    relativePath,
  });
  try {
    const sourceBuffer =
      await getPrivateUploadBucket().fetchFileBuffer(sourcePath);
    return new Ok(Buffer.from(sourceBuffer));
  } catch (error) {
    if (isGCSNotFoundError(error)) {
      return new Err(
        new FramePublicationError(
          "source_not_found",
          `Frame publication source file not found: ${relativePath}`
        )
      );
    }
    throw error;
  }
}
