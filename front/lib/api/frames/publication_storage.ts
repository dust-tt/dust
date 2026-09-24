import { createHash, randomUUID } from "node:crypto";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { reconcileFramePublicationDatabases } from "@app/lib/api/frames/database_reconciliation";
import {
  buildFrameFunctionsTarArchive,
  FRAME_FUNCTIONS_ARCHIVE_CONTENT_TYPE,
  parseFrameFunctionsTarArchive,
} from "@app/lib/api/frames/functions_archive";
import { withFramePublishLock } from "@app/lib/api/frames/operation_lock";
import { seedFramePublicationFunctionsArchive } from "@app/lib/api/frames/seed_functions_archive";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { computeAuthorizedFileAccessForShare } from "@app/lib/api/viz/authorized_file_access";
import { emitFrameAuthorizedFilesUpdatedAuditLog } from "@app/lib/api/viz/frame_authorized_files_audit";
import type { Authenticator } from "@app/lib/auth";
import {
  GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import { isLockAcquisitionTimeoutError } from "@app/lib/lock";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import type { FramePublicationFunctionDefinition } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import {
  getFrameV2NameFromManifestPath,
  isSafeFrameRelativePath,
} from "@app/types/api/frame_manifest";
import type { FramePublicationDescriptor } from "@app/types/api/frame_publication";
import {
  FRAME_PUBLICATION_SCHEMA_VERSION,
  FramePublicationDescriptorSchema,
  parseFramePublicationDescriptor,
} from "@app/types/api/frame_publication";
import {
  getFramePublicationDescriptorPath,
  getFramePublicationFunctionsArchivePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import type { SandboxFunctionUserIdentityPolicy } from "@app/types/api/sandbox_functions";
import type { AllSupportedFileContentType } from "@app/types/files";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
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
      | "invalid_function_reference"
      | "invalid_manifest"
      | "invalid_publication"
      | "invalid_source"
      | "invalid_tailwind"
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

type FramePublicationContracts = Pick<
  FramePublicationDescriptor,
  "databases" | "functions"
>;

export function buildFramePublicationContracts({
  functionArtifacts,
  manifest,
  sourceFiles,
}: {
  functionArtifacts: FramePublicationFunctionArtifact[];
  manifest: FrameManifest;
  sourceFiles: FramePublicationSourceFile[];
}): Result<FramePublicationContracts, FramePublicationError> {
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

  const databases: FramePublicationDescriptor["databases"] = [];
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
    databases.push({
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

  const functions: FramePublicationDescriptor["functions"] = [];
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
    functions.push({
      name: fn.name,
      bundleSha256: sha256(artifact.bundleCode),
      userIdentity: artifact.userIdentity,
      inputSchema: artifact.inputSchema,
      outputSchema: artifact.outputSchema,
    });
  }

  return new Ok({ databases, functions });
}

/**
 * @cc [owner:davidebbo,label:backend] publication-row-before-objects
 * The publication's `frame_publications` row MUST be committed before any of its objects is
 * written to GCS, so that no stored publication lacks a row. A failure after the insert leaves a
 * row whose `publication.json` does not exist: that publication is uncommitted.
 */
export async function storeFramePublication(
  auth: Authenticator,
  {
    frame,
    functionArtifacts,
    manifest,
    sourceFiles,
    uiBundleCode,
    publishedByAgentConfigurationId,
  }: {
    frame: FileResource;
    functionArtifacts: FramePublicationFunctionArtifact[];
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    uiBundleCode: string;
    publishedByAgentConfigurationId?: string;
  }
): Promise<Result<{ publicationId: string }, FramePublicationError>> {
  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const contracts = buildFramePublicationContracts({
    functionArtifacts,
    manifest,
    sourceFiles,
  });
  if (contracts.isErr()) {
    return contracts;
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
    functions: contracts.value.functions,
    databases: contracts.value.databases,
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

  await FramePublicationResource.makeNew(auth, {
    frame,
    publicationId: identity.publicationId,
    publishedByAgentConfigurationId,
  });

  const publicationFiles: Array<{
    filePath: string;
    content: string | Buffer;
    contentType: string;
  }> = [
    {
      filePath: getFramePublicationUiBundlePath(identity),
      content: uiBundleCode,
      contentType: frameContentType,
    },
  ];

  // One object for every published function bundle. Cold invocation extracts
  // it once; poke/activation read the same archive.
  if (functionArtifacts.length > 0) {
    const functionsArchive = await buildFrameFunctionsTarArchive(
      functionArtifacts.map((artifact) => ({
        name: artifact.name,
        content: artifact.bundleCode,
      }))
    );
    publicationFiles.push({
      filePath: getFramePublicationFunctionsArchivePath(identity),
      content: functionsArchive,
      contentType: FRAME_FUNCTIONS_ARCHIVE_CONTENT_TYPE,
    });
  }

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

  return new Ok({ publicationId: identity.publicationId });
}

/**
 * The published bundle of a single Frame function, taken from `functions.tar`.
 * Activation verifies every entry's hash via the same archive; poke only needs
 * one slug and still shares this path.
 */
export async function readFramePublicationFunctionBundle(
  auth: Authenticator,
  {
    frame,
    publicationId,
    functionName,
  }: {
    frame: FileResource;
    publicationId: string;
    functionName: string;
  }
): Promise<Result<string, FramePublicationError>> {
  const bundles = await loadFramePublicationFunctionBundles(auth, {
    frame,
    publicationId,
  });
  if (bundles.isErr()) {
    return bundles;
  }

  const bundleCode = bundles.value.get(functionName);
  if (bundleCode === undefined) {
    return new Err(
      new FramePublicationError(
        "publication_not_found",
        `Frame publication function artifact not found: ${functionName}`
      )
    );
  }

  return new Ok(bundleCode);
}

async function loadFramePublicationFunctionBundles(
  auth: Authenticator,
  {
    frame,
    publicationId,
  }: {
    frame: FileResource;
    publicationId: string;
  }
): Promise<Result<Map<string, string>, FramePublicationError>> {
  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const archivePath = getFramePublicationFunctionsArchivePath({
    ...frameIdentity.value,
    publicationId,
  });

  let archiveBuffer: Buffer;
  try {
    archiveBuffer = Buffer.from(
      await getPrivateUploadBucket().fetchFileBuffer(archivePath)
    );
  } catch (error) {
    if (!isGCSNotFoundError(error)) {
      throw error;
    }
    return new Err(
      new FramePublicationError(
        "publication_not_found",
        `Frame publication functions archive not found: ${publicationId}`
      )
    );
  }

  return new Ok(await parseFrameFunctionsTarArchive(archiveBuffer));
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
  if (descriptor.manifest.functions.length === 0) {
    return new Ok([]);
  }

  const bundles = await loadFramePublicationFunctionBundles(auth, {
    frame,
    publicationId,
  });
  if (bundles.isErr()) {
    return bundles;
  }

  const definitions = await concurrentExecutor(
    descriptor.manifest.functions,
    async (fn, index) => {
      const bundleCode = bundles.value.get(fn.name);
      if (bundleCode === undefined) {
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
    publishedByAgentConfigurationId,
  }: {
    frame: FileResource;
    publicationId: string;
    publishedByAgentConfigurationId?: string;
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
    await frame.setActiveFramePublication(
      {
        publicationId,
        description: descriptor.value.manifest.description,
        publishedByAgentConfigurationId,
      },
      transaction
    );
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
        name:
          (frame.mountFilePath
            ? getFrameV2NameFromManifestPath(frame.mountFilePath)
            : null) ?? frame.sId,
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
    publishedByAgentConfigurationId,
  }: {
    frame: FileResource;
    functionArtifacts: FramePublicationFunctionArtifact[];
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    uiBundleCode: string;
    publishedByAgentConfigurationId?: string;
  }
): Promise<
  Result<
    { publicationId: string },
    FramePublicationError | SandboxFunctionError
  >
> {
  const publication = await withFramePublishLock<
    { publicationId: string },
    FramePublicationError | SandboxFunctionError
  >(frame.sId, async () => {
    const storedPublication = await storeFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest,
      sourceFiles,
      uiBundleCode,
      publishedByAgentConfigurationId,
    });
    if (storedPublication.isErr()) {
      return storedPublication;
    }

    const reconciliation = await reconcileFramePublicationDatabases(auth, {
      frame,
      manifest,
      sourceFiles,
    });
    if (reconciliation.isErr()) {
      return reconciliation;
    }

    const activation = await activateFramePublication(auth, {
      frame,
      publicationId: storedPublication.value.publicationId,
      publishedByAgentConfigurationId,
    });
    if (activation.isErr()) {
      return activation;
    }

    return storedPublication;
  });
  if (publication.isErr()) {
    const error = publication.error;
    if (isLockAcquisitionTimeoutError(error)) {
      return new Err(
        new SandboxFunctionError(
          "publish_conflict",
          "Another publication is in progress for this Frame; retry shortly."
        )
      );
    }
    return new Err(error);
  }

  // Eagerly materialize publication bundles and start the publication worker
  // (eager import) when the publication has functions. Fire-and-forget: never
  // block or fail publish on seed errors.
  if (functionArtifacts.length > 0) {
    void seedFramePublicationFunctionsArchive(auth, {
      frame,
      publicationId: publication.value.publicationId,
    }).catch((err) => {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          frameId: frame.sId,
          publicationId: publication.value.publicationId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Unhandled functions.tar seed rejection"
      );
    });
  }

  return publication;
}
