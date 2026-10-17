import { createHash, randomUUID } from "node:crypto";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  extractFrameFunctionToolCalls,
  sortAndDedupeToolCalls,
} from "@app/lib/api/frames/extract_tool_calls";
import {
  buildFrameFunctionsTarArchive,
  FRAME_FUNCTIONS_ARCHIVE_CONTENT_TYPE,
  parseFrameFunctionsTarArchive,
} from "@app/lib/api/frames/functions_archive";
import { withFramePublishLock } from "@app/lib/api/frames/operation_lock";
import { withFramePublishTimingResult } from "@app/lib/api/frames/publish_timing";
import { seedFramePublicationFunctionsArchive } from "@app/lib/api/frames/seed_functions_archive";
import { SANDBOX_HTTPS_SECRET_ENV_VAR_PREFIX } from "@app/lib/api/sandbox/env_vars";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { computeAuthorizedFileAccessForShare } from "@app/lib/api/viz/authorized_file_access";
import { emitFrameAuthorizedFilesUpdatedAuditLog } from "@app/lib/api/viz/frame_authorized_files_audit";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
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
import type {
  FramePublicationDescriptor,
  FramePublicationStatus,
  FramePublishMode,
  FrameToolCallPair,
} from "@app/types/api/frame_publication";
import {
  FRAME_PUBLICATION_SCHEMA_VERSION,
  FramePublicationDescriptorSchema,
  isSameFramePublicationContent,
  parseFramePublicationDescriptor,
} from "@app/types/api/frame_publication";
import {
  getFramePublicationDescriptorPath,
  getFramePublicationFunctionsArchivePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import type {
  AllSupportedFileContentType,
  ComputedAuthorizedFileAccess,
} from "@app/types/files";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { isFramesV2PublicFunctionsEnabled } from "@app/types/shared/feature_flags";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { JSONSchema7 as JSONSchema } from "json-schema";

const FRAME_PUBLICATION_UPLOAD_CONCURRENCY = 4;

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
      | "sharing_conflict"
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

type CheckPublicFrameFunctionInput = {
  name: string;
  userIdentity: SandboxFunctionUserIdentityPolicy;
  executionMode: SandboxFunctionExecutionMode;
  bundleCode: string;
  publicFunctionsEnabled: boolean;
};

/**
 * @cc [owner:achilleburah,label:product] public-function-publish-requirements
 * A function declaring the `public` user identity policy MUST be refused with
 * `invalid_function_artifact` unless public Frame functions are enabled for the workspace (see
 * isFramesV2PublicFunctionsEnabled) and its manifest declares the `fast` execution mode. A function
 * with any other policy MUST pass.
 */
/**
 * @cc [owner:achilleburah,label:product] public-function-no-secrets
 * A function declaring the `public` user identity policy MUST be refused with
 * `invalid_function_artifact` when its bundle contains SANDBOX_HTTPS_SECRET_ENV_VAR_PREFIX. This is
 * intentionally stricter than the Frames v2 skill and the secret swap design, which allow any
 * Frame function to use `DSEC_*` secrets. Functions with any other policy MUST keep that access.
 * The check is a static authoring guardrail: a secret name built at runtime passes it, so it MUST
 * NOT be treated as a sandbox boundary.
 */
function checkPublicFrameFunction({
  name,
  userIdentity,
  executionMode,
  bundleCode,
  publicFunctionsEnabled,
}: CheckPublicFrameFunctionInput): Result<undefined, FramePublicationError> {
  if (userIdentity !== "public") {
    return new Ok(undefined);
  }
  if (!publicFunctionsEnabled) {
    return new Err(
      new FramePublicationError(
        "invalid_function_artifact",
        `Frame function "${name}" declares \`userIdentity: "public"\`, but public Frame functions ` +
          "are not enabled for this workspace. Declare another user identity policy, such as " +
          "`workspace_user_required`."
      )
    );
  }
  if (executionMode !== "fast") {
    return new Err(
      new FramePublicationError(
        "invalid_function_artifact",
        `Frame function "${name}" is public, so its manifest entry must declare ` +
          '`"executionMode": "fast"`. Public functions cannot call Dust tools.'
      )
    );
  }
  if (bundleCode.includes(SANDBOX_HTTPS_SECRET_ENV_VAR_PREFIX)) {
    return new Err(
      new FramePublicationError(
        "invalid_function_artifact",
        `Frame function "${name}" is public and references a secret ` +
          `(\`${SANDBOX_HTTPS_SECRET_ENV_VAR_PREFIX}\`). Public functions cannot use secrets: ` +
          "remove the secret or declare another user identity policy."
      )
    );
  }
  return new Ok(undefined);
}

type FramePublicationContracts = Pick<
  FramePublicationDescriptor,
  "databases" | "functions"
> & {
  /** Frame-level union of every function's toolCalls, sorted and deduped. */
  requiredTools: FrameToolCallPair[];
};

function sourceContentByPath(
  sourceFilesByPath: ReadonlyMap<string, FramePublicationSourceFile>
): Map<string, string> {
  const sourceByPath = new Map<string, string>();
  for (const [relativePath, sourceFile] of sourceFilesByPath) {
    sourceByPath.set(relativePath, sourceFile.content.toString("utf8"));
  }
  return sourceByPath;
}

export function buildFramePublicationContracts({
  functionArtifacts,
  manifest,
  publicFunctionsEnabled,
  sourceFiles,
}: {
  functionArtifacts: FramePublicationFunctionArtifact[];
  manifest: FrameManifest;
  publicFunctionsEnabled: boolean;
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

  const sourceByPath = sourceContentByPath(sourceFilesByPath);
  const functions: FramePublicationDescriptor["functions"] = [];
  const requiredTools: FrameToolCallPair[] = [];
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
    const publicCheck = checkPublicFrameFunction({
      name: fn.name,
      userIdentity: artifact.userIdentity,
      executionMode: fn.executionMode,
      bundleCode: artifact.bundleCode,
      publicFunctionsEnabled,
    });
    if (publicCheck.isErr()) {
      return publicCheck;
    }

    const toolCallsResult = extractFrameFunctionToolCalls({
      entryPoint: fn.entryPoint,
      sourceByPath,
    });
    if (toolCallsResult.isErr()) {
      return new Err(
        new FramePublicationError(
          "invalid_function_artifact",
          `Frame function "${fn.name}": ${toolCallsResult.error.message}`
        )
      );
    }
    const toolCalls = toolCallsResult.value;
    if (toolCalls.length > 0 && fn.executionMode === "fast") {
      return new Err(
        new FramePublicationError(
          "invalid_function_artifact",
          `Frame function "${fn.name}" calls Dust tools, so its manifest entry must declare ` +
            '`"executionMode": "durable"`. Fast functions cannot call tools.'
        )
      );
    }
    requiredTools.push(...toolCalls);
    functions.push({
      name: fn.name,
      bundleSha256: sha256(artifact.bundleCode),
      userIdentity: artifact.userIdentity,
      inputSchema: artifact.inputSchema,
      outputSchema: artifact.outputSchema,
      toolCalls,
    });
  }

  return new Ok({
    databases,
    functions,
    requiredTools: sortAndDedupeToolCalls(requiredTools),
  });
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
  }: {
    frame: FileResource;
    functionArtifacts: FramePublicationFunctionArtifact[];
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    uiBundleCode: string;
  }
): Promise<
  Result<
    { publicationId: string; descriptor: FramePublicationDescriptor },
    FramePublicationError
  >
> {
  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  const publicFunctionsEnabled = isFramesV2PublicFunctionsEnabled(
    await getFeatureFlags(auth)
  );

  const contracts = buildFramePublicationContracts({
    functionArtifacts,
    manifest,
    publicFunctionsEnabled,
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
    requiredTools: contracts.value.requiredTools,
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

  return new Ok({ publicationId: identity.publicationId, descriptor });
}

/**
 * The published bundle of a single Frame function, taken from `functions.tar`. Used by poke to
 * inspect a publication's bundle; publishing verifies bundle hashes against the artifacts it
 * stages.
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

function functionDefinitionsFromBundles({
  descriptor,
  bundles,
}: {
  descriptor: FramePublicationDescriptor;
  bundles: Map<string, string>;
}): Result<FramePublicationFunctionDefinition[], FramePublicationError> {
  const definitions: FramePublicationFunctionDefinition[] = [];
  for (const [index, fn] of descriptor.manifest.functions.entries()) {
    const bundleCode = bundles.get(fn.name);
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

    definitions.push({
      name: fn.name,
      description: fn.description,
      executionMode: fn.executionMode,
      defaultStake: fn.defaultStake,
      bundleCode,
      userIdentity: contract.userIdentity,
      inputSchema: contract.inputSchema,
      outputSchema: contract.outputSchema,
    });
  }
  return new Ok(definitions);
}

function loadFramePublicationFunctionDefinitions({
  descriptor,
  functionArtifacts,
}: {
  descriptor: FramePublicationDescriptor;
  functionArtifacts: FramePublicationFunctionArtifact[];
}): Result<FramePublicationFunctionDefinition[], FramePublicationError> {
  if (descriptor.manifest.functions.length === 0) {
    return new Ok([]);
  }

  return functionDefinitionsFromBundles({
    descriptor,
    bundles: new Map(
      functionArtifacts.map((artifact) => [artifact.name, artifact.bundleCode])
    ),
  });
}

/**
 * Make a stored publication invocable by creating its immutable function rows. Does not touch the
 * Frame's pointers. Rows left behind by a publication that never goes live are purged by
 * retention.
 */
export async function createFramePublicationFunctionRows(
  auth: Authenticator,
  {
    frame,
    publicationId,
    descriptor,
    functionArtifacts,
  }: {
    frame: FileResource;
    publicationId: string;
    descriptor: FramePublicationDescriptor;
    functionArtifacts: FramePublicationFunctionArtifact[];
  }
): Promise<Result<void, FramePublicationError>> {
  const functionDefinitions = loadFramePublicationFunctionDefinitions({
    descriptor,
    functionArtifacts,
  });
  if (functionDefinitions.isErr()) {
    return functionDefinitions;
  }

  await withTransaction(async (tx) => {
    await SandboxFunctionResource.createForFramePublication(
      auth,
      { frame, functions: functionDefinitions.value, publicationId },
      tx
    );
  });
  return new Ok(undefined);
}

/**
 * @cc [owner:davidebbo,label:product] draft-publish-checks-the-share-allowlist
 * A draft publish MUST fail on the share allowlist exactly when a live publish of the same content
 * would (both go through this helper), so a draft never hides a failure until make-live.
 */
async function computeFramePublicationAllowlist(
  auth: Authenticator,
  frame: FileResource,
  uiBundleCode: string
): Promise<Result<ComputedAuthorizedFileAccess, FramePublicationError>> {
  const allowlist = await computeAuthorizedFileAccessForShare(auth, frame, {
    frameContent: uiBundleCode,
  });
  if (allowlist.isErr()) {
    return new Err(
      new FramePublicationError("allowlist_failed", allowlist.error.message)
    );
  }
  return allowlist;
}

/**
 * @cc [owner:davidebbo,label:backend] activation-requires-staged-function-rows
 * Callers MUST have created the publication's function rows first
 * (`createFramePublicationFunctionRows`); activation only moves the live pointer, so activating an
 * unstaged publication with functions makes them uninvocable.
 */
export async function activateFramePublication(
  auth: Authenticator,
  {
    frame,
    publicationId,
    publishedByAgentConfigurationId,
    descriptor: providedDescriptor,
    uiBundleCode: providedUiBundleCode,
  }: {
    frame: FileResource;
    publicationId: string;
    publishedByAgentConfigurationId?: string;
    /** When set (publish path), skip re-fetching publication.json from GCS. */
    descriptor?: FramePublicationDescriptor;
    /** When set (publish path), skip re-fetching ui/bundle.js from GCS. */
    uiBundleCode?: string;
  }
): Promise<Result<void, FramePublicationError>> {
  let descriptor: FramePublicationDescriptor;
  if (providedDescriptor) {
    descriptor = providedDescriptor;
  } else {
    const loaded = await loadFramePublicationDescriptor(auth, {
      frame,
      publicationId,
    });
    if (loaded.isErr()) {
      return loaded;
    }
    descriptor = loaded.value;
  }

  const frameIdentity = getFrameIdentity(auth, frame);
  if (frameIdentity.isErr()) {
    return frameIdentity;
  }

  let uiBundleCode: string;
  if (providedUiBundleCode !== undefined) {
    uiBundleCode = providedUiBundleCode;
  } else {
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
  }
  if (sha256(uiBundleCode) !== descriptor.ui.bundleSha256) {
    return new Err(
      new FramePublicationError(
        "invalid_publication",
        `Frame publication UI bundle hash mismatch: ${publicationId}`
      )
    );
  }

  await frame.ensureShareableFrame(auth);
  const allowlist = await computeFramePublicationAllowlist(
    auth,
    frame,
    uiBundleCode
  );
  if (allowlist.isErr()) {
    return allowlist;
  }
  const shareScope = await frame.getShareScope();

  await withTransaction(async (transaction) => {
    // Updating the Frame first serializes concurrent activations. None of the
    // new publication state becomes visible until the transaction commits.
    await frame.setActiveFramePublication(
      {
        publicationId,
        description: descriptor.manifest.description,
        publishedByAgentConfigurationId,
      },
      transaction
    );
    await frame.persistAuthorizedFileAccess(allowlist.value, { transaction });
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
    mode,
  }: {
    frame: FileResource;
    functionArtifacts: FramePublicationFunctionArtifact[];
    manifest: FrameManifest;
    sourceFiles: FramePublicationSourceFile[];
    uiBundleCode: string;
    publishedByAgentConfigurationId?: string;
    mode: FramePublishMode;
  }
): Promise<
  Result<
    { publicationId: string; status: FramePublicationStatus },
    FramePublicationError | SandboxFunctionError
  >
> {
  const timingContext = {
    workspaceId: auth.getNonNullableWorkspace().sId,
    frameId: frame.sId,
    sourceFileCount: sourceFiles.length,
    functionCount: functionArtifacts.length,
    databaseCount: manifest.databases.length,
  };

  const publication = await withFramePublishLock<
    { publicationId: string; status: FramePublicationStatus },
    FramePublicationError | SandboxFunctionError
  >(frame.sId, async () => {
    // Re-read under the lock so concurrent publishes see each other's pointers.
    const freshFrame = await frame.fetchFreshFrameV2(auth);
    if (!freshFrame) {
      return new Err(
        new FramePublicationError("invalid_frame", "Frame not found.")
      );
    }

    // DB reconcile runs during build (shared Frame-sandbox staging). Store then
    // stage or activate using in-memory artifacts — no GCS re-fetch of what we just wrote.
    const stored = await withFramePublishTimingResult(
      "store",
      timingContext,
      () =>
        storeFramePublication(auth, {
          frame: freshFrame,
          functionArtifacts,
          manifest,
          sourceFiles,
          uiBundleCode,
        })
    );
    if (stored.isErr()) {
      return stored;
    }
    const { publicationId, descriptor } = stored.value;
    const livePublicationId = freshFrame.useCaseMetadata?.activePublicationId;
    // A Frame with nothing live has nothing to protect: its first publish always goes live.
    const publishesDraft = mode === "draft" && livePublicationId !== undefined;

    if (publishesDraft) {
      // The allowlist is only checked here, not persisted: the share link keeps serving the live
      // one until activation computes and persists its own. It runs before the compare-to-live
      // shortcut so a draft publish fails exactly when a live publish of the same content would,
      // even when that content matches what is live. The shareable row already exists because a
      // draft only exists on a Frame that went live.
      const allowlist = await withFramePublishTimingResult(
        "allowlist",
        timingContext,
        () => computeFramePublicationAllowlist(auth, freshFrame, uiBundleCode)
      );
      if (allowlist.isErr()) {
        return allowlist;
      }

      const live = await withFramePublishTimingResult(
        "compare",
        timingContext,
        () =>
          loadFramePublicationDescriptor(auth, {
            frame: freshFrame,
            publicationId: livePublicationId,
          })
      );
      if (live.isErr()) {
        return live;
      }
      if (isSameFramePublicationContent(live.value, descriptor)) {
        if (freshFrame.pendingDraftPublicationId) {
          await freshFrame.dropPendingDraft();
        }
        return new Ok({
          publicationId: livePublicationId,
          status: "live" as const,
        });
      }
    }

    const rows = await withFramePublishTimingResult(
      "stage",
      { ...timingContext, publicationId },
      () =>
        createFramePublicationFunctionRows(auth, {
          frame: freshFrame,
          publicationId,
          descriptor,
          functionArtifacts,
        })
    );
    if (rows.isErr()) {
      return rows;
    }

    if (publishesDraft) {
      // Editors are served the draft in the app; the share link keeps serving the live publication.
      await freshFrame.setLatestFramePublication({
        publicationId,
        publishedByAgentConfigurationId,
      });
      return new Ok({ publicationId, status: "draft" as const });
    }

    const activation = await withFramePublishTimingResult(
      "activate",
      { ...timingContext, publicationId },
      () =>
        activateFramePublication(auth, {
          frame: freshFrame,
          publicationId,
          publishedByAgentConfigurationId,
          descriptor,
          uiBundleCode,
        })
    );
    if (activation.isErr()) {
      return activation;
    }
    return new Ok({ publicationId, status: "live" as const });
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
