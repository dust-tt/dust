import { createHash, randomUUID } from "node:crypto";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { reconcileFramePublicationDatabases } from "@app/lib/api/frames/database_reconciliation";
import { withFramePublishLock } from "@app/lib/api/frames/operation_lock";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
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
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchRetiredFramePublicationCleanupWorkflow } from "@app/temporal/sandbox_functions/client";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type { FramePublicationDescriptor } from "@app/types/api/frame_publication";
import {
  FRAME_PUBLICATION_SCHEMA_VERSION,
  FramePublicationDescriptorSchema,
  parseFramePublicationDescriptor,
} from "@app/types/api/frame_publication";
import {
  getFramePublicationBasePath,
  getFramePublicationDescriptorPath,
  getFramePublicationFunctionBundlePath,
  getFramePublicationsBasePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import type { SandboxFunctionUserIdentityPolicy } from "@app/types/api/sandbox_functions";
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

const FRAME_PUBLICATION_UPLOAD_CONCURRENCY = 4;
const FRAME_PUBLICATION_READ_CONCURRENCY = 4;

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
      | "invalid_publication"
      | "invalid_source"
      | "allowlist_failed"
      | "publication_not_found"
      | "ui_build_failed"
      | "unauthorized",
    message: string
  ) {
    super(message);
    this.name = "FramePublicationError";
  }
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function cleanupInactiveFramePublication(
  auth: Authenticator,
  {
    frame,
    publicationId,
    reason,
  }: {
    frame: FileResource;
    publicationId: string;
    reason: "activation_failed" | "reconciliation_failed" | "storage_failed";
  }
): Promise<void> {
  try {
    const freshFrame = await frame.fetchFreshFrameV2(auth);
    if (freshFrame?.useCaseMetadata?.activePublicationId === publicationId) {
      logger.error(
        {
          frameId: frame.sId,
          publicationId,
          reason,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Refusing to clean up an active Frame publication"
      );
      return;
    }

    await getPrivateUploadBucket().deleteByPrefix(
      getFramePublicationBasePath({
        workspaceId: auth.getNonNullableWorkspace().sId,
        frameId: frame.sId,
        publicationId,
      })
    );
  } catch (error) {
    logger.error(
      {
        error: normalizeError(error),
        frameId: frame.sId,
        publicationId,
        reason,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Failed to clean up an inactive Frame publication"
    );
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

async function cleanupStaleFramePublicationArtifacts(
  auth: Authenticator,
  { frame }: { frame: FileResource }
): Promise<void> {
  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return;
  }

  const storage = getPrivateUploadBucket();
  try {
    const freshFrame = await frame.fetchFreshFrameV2(auth);
    const activePublicationId =
      freshFrame?.useCaseMetadata?.activePublicationId;
    const publicationIds = await storage.listSubdirectoryNames({
      prefix: getFramePublicationsBasePath(frameIdentity.value),
    });

    await concurrentExecutor(
      publicationIds,
      async (publicationId) => {
        if (publicationId === activePublicationId) {
          return;
        }

        try {
          const descriptorPath = getFramePublicationDescriptorPath({
            ...frameIdentity.value,
            publicationId,
          });
          const [isCommitted] = await storage.file(descriptorPath).exists();
          if (!isCommitted) {
            await storage.deleteByPrefix(
              getFramePublicationBasePath({
                ...frameIdentity.value,
                publicationId,
              })
            );
          } else {
            await scheduleRetiredFramePublicationCleanup(
              frameIdentity.value,
              publicationId
            );
          }
        } catch (error) {
          logger.error(
            {
              err: normalizeError(error),
              frameId: frame.sId,
              publicationId,
              workspaceId: frameIdentity.value.workspaceId,
            },
            "Failed to clean up stale Frame publication artifacts"
          );
        }
      },
      { concurrency: FRAME_PUBLICATION_READ_CONCURRENCY }
    );
  } catch (error) {
    logger.error(
      {
        err: normalizeError(error),
        frameId: frame.sId,
        workspaceId: frameIdentity.value.workspaceId,
      },
      "Failed to list stale Frame publication artifacts"
    );
  }
}

async function scheduleRetiredFramePublicationCleanup(
  { frameId, workspaceId }: { frameId: string; workspaceId: string },
  publicationId: string
): Promise<void> {
  const result = await launchRetiredFramePublicationCleanupWorkflow({
    frameId,
    publicationId,
    workspaceId,
  });
  if (result.isErr()) {
    logger.error(
      {
        err: result.error,
        frameId,
        publicationId,
        workspaceId,
      },
      "Failed to schedule retired Frame publication cleanup"
    );
  }
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

  const sourceFilesByPath = new Map<string, FramePublicationSourceFile>();
  for (const sourceFile of sourceFiles) {
    if (!isSafeFrameRelativePath(sourceFile.relativePath)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Invalid Frame source path: ${sourceFile.relativePath}`
        )
      );
    }
    if (sourceFilesByPath.has(sourceFile.relativePath)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Duplicate Frame source path: ${sourceFile.relativePath}`
        )
      );
    }
    sourceFilesByPath.set(sourceFile.relativePath, sourceFile);
  }
  if (!sourceFilesByPath.has(manifest.uiEntryPoint)) {
    return new Err(
      new FramePublicationError(
        "invalid_source",
        `Frame UI entry point not found: ${manifest.uiEntryPoint}`
      )
    );
  }
  for (const fn of manifest.functions) {
    if (!sourceFilesByPath.has(fn.entryPoint)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Frame function entry point not found: ${fn.name} (${fn.entryPoint})`
        )
      );
    }
  }
  const databaseContracts: FramePublicationDescriptor["databases"] = [];
  for (const database of manifest.databases) {
    const schemaFile = sourceFilesByPath.get(database.schema);
    if (!schemaFile) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Frame database schema not found: ${database.name} (${database.schema})`
        )
      );
    }
    const schemaSource = schemaFile.content.toString("utf8");
    if (!Buffer.from(schemaSource, "utf8").equals(schemaFile.content)) {
      return new Err(
        new FramePublicationError(
          "invalid_source",
          `Frame database schema is not valid UTF-8: ${database.name} (${database.schema})`
        )
      );
    }
    databaseContracts.push({
      name: database.name,
      schemaSource,
      schemaSha256: sha256(schemaSource),
    });
  }

  const declaredFunctionNames = new Set(
    manifest.functions.map((fn) => fn.name)
  );
  const functionArtifactsByName = new Map<
    string,
    FramePublicationFunctionArtifact
  >();
  for (const artifact of functionArtifacts) {
    if (functionArtifactsByName.has(artifact.name)) {
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
    functionArtifactsByName.set(artifact.name, artifact);
  }
  const functionContracts: FramePublicationDescriptor["functions"] = [];
  for (const fn of manifest.functions) {
    const artifact = functionArtifactsByName.get(fn.name);
    if (!artifact) {
      return new Err(
        new FramePublicationError(
          "invalid_function_artifact",
          `Frame function artifact is missing: ${fn.name}`
        )
      );
    }
    functionContracts.push({
      name: fn.name,
      bundleSha256: sha256(artifact.bundleCode),
      userIdentity: artifact.userIdentity,
      inputSchema: artifact.inputSchema,
      outputSchema: artifact.outputSchema,
    });
  }

  const identity = {
    ...frameIdentity.value,
    publicationId: randomUUID(),
  };
  const storage = getPrivateUploadBucket();

  const descriptorResult = FramePublicationDescriptorSchema.safeParse({
    schemaVersion: FRAME_PUBLICATION_SCHEMA_VERSION,
    manifest,
    publishedAt: new Date().toISOString(),
    publisherId: auth.user()?.sId ?? null,
    sourceFiles: sourceFiles
      .map((sourceFile) => ({
        path: sourceFile.relativePath,
        contentSha256: sha256(sourceFile.content),
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    ui: { bundleSha256: sha256(uiBundleCode) },
    functions: functionContracts,
    databases: databaseContracts,
  } satisfies FramePublicationDescriptor);
  if (!descriptorResult.success) {
    return new Err(
      new FramePublicationError(
        "invalid_publication",
        `Invalid Frame publication descriptor: ${descriptorResult.error.message}`
      )
    );
  }
  const descriptor = descriptorResult.data;

  const publicationFiles = [
    {
      filePath: getFramePublicationUiBundlePath(identity),
      content: uiBundleCode,
      contentType: frameContentType,
    },
    ...functionArtifacts.map((artifact) => ({
      filePath: getFramePublicationFunctionBundlePath({
        ...identity,
        functionName: artifact.name,
      }),
      content: artifact.bundleCode,
      contentType: sandboxFunctionContentType,
    })),
  ];

  const publicationFileWrites = await concurrentExecutor(
    publicationFiles,
    async ({ filePath, content, contentType }) => {
      try {
        await storage.file(filePath).save(content, {
          contentType,
          preconditionOpts: {
            ifGenerationMatch: GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
          },
        });
        return new Ok(undefined);
      } catch (error) {
        return new Err(normalizeError(error));
      }
    },
    { concurrency: FRAME_PUBLICATION_UPLOAD_CONCURRENCY }
  );
  const failedPublicationFile = publicationFileWrites.find((write) =>
    write.isErr()
  );
  if (failedPublicationFile?.isErr()) {
    await cleanupInactiveFramePublication(auth, {
      frame,
      publicationId: identity.publicationId,
      reason: "storage_failed",
    });
    throw failedPublicationFile.error;
  }

  try {
    // publication.json is the commit marker. Readers never observe partial publication data.
    const descriptorPath = getFramePublicationDescriptorPath(identity);
    await storage
      .file(descriptorPath)
      .save(Buffer.from(JSON.stringify(descriptor)), {
        contentType: frameV2ContentType,
        preconditionOpts: {
          ifGenerationMatch: GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
        },
      });
  } catch (error) {
    await cleanupInactiveFramePublication(auth, {
      frame,
      publicationId: identity.publicationId,
      reason: "storage_failed",
    });
    throw error;
  }

  return new Ok({ publicationId: identity.publicationId });
}

export async function loadFramePublicationDescriptor(
  auth: Authenticator,
  {
    frame,
    publicationId,
  }: {
    frame: FileResource;
    publicationId: string;
  }
): Promise<Result<FramePublicationDescriptor, FramePublicationError>> {
  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const descriptorPath = getFramePublicationDescriptorPath({
    ...frameIdentity.value,
    publicationId,
  });
  let descriptorBuffer: Uint8Array<ArrayBuffer>;
  try {
    descriptorBuffer =
      await getPrivateUploadBucket().fetchFileBuffer(descriptorPath);
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

  const descriptor = parseFramePublicationDescriptor(
    Buffer.from(descriptorBuffer)
  );
  if (descriptor.isErr()) {
    return new Err(
      new FramePublicationError("invalid_publication", descriptor.error)
    );
  }

  const invalidDatabaseContract = descriptor.value.databases.find(
    (database) => sha256(database.schemaSource) !== database.schemaSha256
  );
  if (invalidDatabaseContract) {
    return new Err(
      new FramePublicationError(
        "invalid_publication",
        `Frame publication database schema hash mismatch: ${invalidDatabaseContract.name}`
      )
    );
  }

  return descriptor;
}

async function loadFramePublicationFunctionDefinitions(
  auth: Authenticator,
  {
    frame,
    descriptor,
    publicationId,
  }: {
    frame: FileResource;
    descriptor: FramePublicationDescriptor;
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
    descriptor.manifest.functions,
    async (fn, index) => {
      const identity = {
        ...frameIdentity.value,
        publicationId,
        functionName: fn.name,
      };
      let bundleCode: string;
      try {
        bundleCode = await storage.fetchFileContent(
          getFramePublicationFunctionBundlePath(identity)
        );
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

      const contract = descriptor.functions[index];
      if (!contract || sha256(bundleCode) !== contract.bundleSha256) {
        return new Err(
          new FramePublicationError(
            "invalid_function_artifact",
            `Frame publication function bundle hash mismatch: ${fn.name}`
          )
        );
      }

      return new Ok({
        name: fn.name,
        description: fn.description,
        executionMode: fn.executionMode,
        defaultStake: fn.defaultStake,
        bundleCode,
        userIdentity: contract.userIdentity,
        inputSchema: contract.inputSchema,
        outputSchema: contract.outputSchema,
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
  const descriptor = await loadFramePublicationDescriptor(auth, {
    frame,
    publicationId,
  });
  if (descriptor.isErr()) {
    return descriptor;
  }

  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const functionDefinitions = await loadFramePublicationFunctionDefinitions(
    auth,
    { frame, descriptor: descriptor.value, publicationId }
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
  if (sha256(uiBundleCode) !== descriptor.value.ui.bundleSha256) {
    return new Err(
      new FramePublicationError(
        "invalid_publication",
        `Frame publication UI bundle hash mismatch: ${publicationId}`
      )
    );
  }

  await frame.ensureShareableFrame(auth);
  const shareScope = await frame.getShareScope();
  const allowlist = await computeAuthorizedFileAccessForShare(auth, frame, {
    frameContent: uiBundleCode,
  });
  if (allowlist.isErr()) {
    return new Err(
      new FramePublicationError("allowlist_failed", allowlist.error.message)
    );
  }

  await withTransaction(async (transaction) => {
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
    await frame.setActiveFramePublication(publicationId, transaction);
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
): Promise<
  Result<
    { publicationId: string },
    FramePublicationError | SandboxFunctionError
  >
> {
  return withFramePublishLock<
    { publicationId: string },
    FramePublicationError | SandboxFunctionError
  >(frame.sId, async () => {
    const previousActivePublicationId = (await frame.fetchFreshFrameV2(auth))
      ?.useCaseMetadata?.activePublicationId;
    await cleanupStaleFramePublicationArtifacts(auth, { frame });

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

    const publicationId = publication.value.publicationId;
    let cleanupReason: "activation_failed" | "reconciliation_failed" =
      "reconciliation_failed";
    let publicationActivated = false;
    try {
      const reconciliation = await reconcileFramePublicationDatabases(auth, {
        frame,
        manifest,
        sourceFiles,
      });
      if (reconciliation.isErr()) {
        return reconciliation;
      }

      cleanupReason = "activation_failed";
      const activation = await activateFramePublication(auth, {
        frame,
        publicationId,
      });
      if (activation.isErr()) {
        return activation;
      }

      publicationActivated = true;
      if (
        previousActivePublicationId &&
        previousActivePublicationId !== publicationId
      ) {
        await scheduleRetiredFramePublicationCleanup(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            frameId: frame.sId,
          },
          previousActivePublicationId
        );
      }
      return publication;
    } finally {
      if (!publicationActivated) {
        await cleanupInactiveFramePublication(auth, {
          frame,
          publicationId,
          reason: cleanupReason,
        });
      }
    }
  });
}
