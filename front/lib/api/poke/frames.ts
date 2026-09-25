import path from "node:path";
import type { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import {
  loadFramePublicationDescriptor,
  readFramePublicationFunctionBundle,
} from "@app/lib/api/frames/publication_storage";
import type { PokeSandboxFunctionInvocation } from "@app/lib/api/poke/sandbox_functions";
import { listSandboxFunctionInvocations } from "@app/lib/api/poke/sandbox_functions";
import type { LiveDatabaseEntry } from "@app/lib/api/sandbox_functions/dsbx_db";
import type { Authenticator } from "@app/lib/auth";
import filestorageConfig from "@app/lib/file_storage/config";
import { makeGcsConsoleUrl, makeGcsUri } from "@app/lib/poke/gcs";
import { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { UserResource } from "@app/lib/resources/user_resource";
import { getFrameV2NameFromManifestPath } from "@app/types/api/frame_manifest";
import { getFrameBasePath } from "@app/types/api/frame_storage";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionInvocationOrigin,
  SandboxFunctionInvocationStatus,
  SandboxFunctionStake,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import type {
  FileShareScope,
  FileStatus,
  SharingGrantType,
} from "@app/types/files";
import type { PokeSandboxType } from "@app/types/poke";
import type { Result } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import countBy from "lodash/countBy";
import groupBy from "lodash/groupBy";
import sumBy from "lodash/sumBy";

export type PokeFrameListItem = {
  sId: string;
  fileName: string;
  // Manifest name and description of the active publication; null until first publish.
  name: string | null;
  description: string | null;
  status: FileStatus;
  mountFilePath: string | null;
  activePublicationId: string | null;
  conversationId: string | null;
  spaceId: string | null;
  functionCount: number;
  sandboxStatus: SandboxStatus | null;
  author: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PokeListFrames = {
  items: PokeFrameListItem[];
  totalCount: number;
};

// Shared by `listWorkspaceFrames` (batched across a page) and `getFrameDetails` (a single frame)
// so both assemble the exact same row shape from the same three pre-fetched maps.
function toPokeFrameListItem(
  frame: FileResource,
  {
    functionCount,
    sandboxStatus,
    author,
  }: {
    functionCount: number;
    sandboxStatus: SandboxStatus | null;
    author: UserResource | undefined;
  }
): PokeFrameListItem {
  return {
    sId: frame.sId,
    fileName: frame.fileName,
    name: frame.mountFilePath
      ? getFrameV2NameFromManifestPath(frame.mountFilePath)
      : null,
    description: frame.useCaseMetadata?.frameDescription ?? null,
    status: frame.status,
    mountFilePath: frame.mountFilePath,
    activePublicationId: frame.useCaseMetadata?.activePublicationId ?? null,
    conversationId: frame.useCaseMetadata?.conversationId ?? null,
    spaceId: frame.useCaseMetadata?.spaceId ?? null,
    functionCount,
    sandboxStatus,
    author: author ? author.fullName() : null,
    createdAt: frame.createdAt.toISOString(),
    updatedAt: frame.updatedAt.toISOString(),
  };
}

export async function listWorkspaceFrames(
  auth: Authenticator,
  {
    hasSandbox,
    ...pagination
  }: {
    limit: number;
    offset: number;
    orderDirection: "asc" | "desc";
    hasSandbox: boolean;
  }
): Promise<PokeListFrames> {
  const { frames, totalCount } =
    await FileResource.listFrameV2ForWorkspacePaginated(auth, {
      ...pagination,
      hasSandbox,
    });

  if (frames.length === 0) {
    return { items: [], totalCount };
  }

  const frameModelIds = frames.map((frame) => frame.id);

  const [functionCounts, sandboxStatuses, authors] = await Promise.all([
    SandboxFunctionResource.countByFrameModelIds(
      auth,
      frames.map((frame) => ({
        frameModelId: frame.id,
        activePublicationId: frame.useCaseMetadata?.activePublicationId ?? null,
      }))
    ),
    FrameSandboxAdapter.fetchSandboxStatusesByFrameModelIds(
      auth,
      frameModelIds
    ),
    UserResource.fetchByModelIds(
      removeNulls(frames.map((frame) => frame.userId))
    ),
  ]);

  const authorsByModelId = new Map(authors.map((user) => [user.id, user]));

  return {
    items: frames.map((frame) =>
      toPokeFrameListItem(frame, {
        functionCount: functionCounts.get(frame.id) ?? 0,
        sandboxStatus: sandboxStatuses.get(frame.id) ?? null,
        author: frame.userId ? authorsByModelId.get(frame.userId) : undefined,
      })
    ),
    totalCount,
  };
}

export type PokeFrameStorageLocation = {
  label: string;
  gcsUri: string;
  consoleUrl: string | null;
};

export type PokeFramePublicationDatabase = {
  name: string;
  schemaSource: string;
  schemaSha256: string;
};

export type PokeFramePublication = {
  publicationId: string;
  publishedAt: string;
  publisher: string | null;
  uiBundleSha256: string;
  sourceFiles: { path: string; contentSha256: string }[];
  databases: PokeFramePublicationDatabase[];
};

/**
 * Who can open the Frame. Four of the six `frame.*` audit actions concern this, and it is the
 * first thing to look at for "why can this person not open it" — hence surfacing scope, the share
 * URL and every grant including revoked ones.
 */
export type PokeFrameSharing = {
  scope: FileShareScope;
  sharedAt: number;
  shareUrl: string;
} | null;

export type PokeFrameDetails = {
  frame: PokeFrameListItem;
  sandbox: PokeSandboxType | null;
  sharing: PokeFrameSharing;
  // Every grant, revoked included: a revoked grant is the answer to "they used to have access".
  sharingGrants: SharingGrantType[];
  storage: PokeFrameStorageLocation[];
  publication: PokeFramePublication | null;
  // Set when the active publication exists but its descriptor could not be read from GCS.
  publicationError: string | null;
};

function makeStorageLocations(
  workspaceId: string,
  frame: FileResource
): PokeFrameStorageLocation[] {
  const bucket = filestorageConfig.getGcsPrivateUploadsBucket();

  const locations: { label: string; prefix: string }[] = [
    {
      label: "Frame root",
      prefix: getFrameBasePath({ workspaceId, frameId: frame.sId }),
    },
  ];

  if (frame.mountFilePath) {
    locations.push({
      label: "Authored source",
      prefix: `${path.posix.dirname(frame.mountFilePath)}/`,
    });
  }

  return locations.map(({ label, prefix }) => ({
    label,
    gcsUri: makeGcsUri(bucket, prefix),
    consoleUrl: makeGcsConsoleUrl(bucket, prefix),
  }));
}

export async function getFrameDetails(
  auth: Authenticator,
  frame: FileResource
): Promise<PokeFrameDetails> {
  const owner = auth.getNonNullableWorkspace();
  const publicationId = frame.useCaseMetadata?.activePublicationId ?? null;

  const [functionCounts, authors, sandbox, sharing, sharingGrants] =
    await Promise.all([
      SandboxFunctionResource.countByFrameModelIds(auth, [
        { frameModelId: frame.id, activePublicationId: publicationId },
      ]),
      UserResource.fetchByModelIds(removeNulls([frame.userId])),
      FrameSandboxAdapter.fetchSandbox(auth, frame),
      frame.getShareInfo(),
      frame.listAllSharingGrants(),
    ]);

  const [author] = authors;

  const listItem = toPokeFrameListItem(frame, {
    functionCount: functionCounts.get(frame.id) ?? 0,
    sandboxStatus: sandbox?.status ?? null,
    author,
  });

  const base = {
    frame: listItem,
    sandbox: sandbox ? sandbox.toPokeJSON() : null,
    sharing,
    sharingGrants,
    storage: makeStorageLocations(owner.sId, frame),
  };

  if (!publicationId) {
    return { ...base, publication: null, publicationError: null };
  }

  const descriptorResult = await loadFramePublicationDescriptor(auth, {
    frame,
    publicationId,
  });
  if (descriptorResult.isErr()) {
    return {
      ...base,
      publication: null,
      publicationError: descriptorResult.error.message,
    };
  }

  const descriptor = descriptorResult.value;
  const publisher = descriptor.publisherId
    ? await UserResource.fetchById(descriptor.publisherId)
    : null;

  return {
    ...base,
    publication: {
      publicationId,
      publishedAt: descriptor.publishedAt,
      publisher: publisher ? publisher.fullName() : descriptor.publisherId,
      uiBundleSha256: descriptor.ui.bundleSha256,
      sourceFiles: descriptor.sourceFiles.map((sourceFile) => ({
        path: sourceFile.path,
        contentSha256: sourceFile.contentSha256,
      })),
      databases: descriptor.databases.map((database) => ({
        name: database.name,
        schemaSource: database.schemaSource,
        schemaSha256: database.schemaSha256,
      })),
    },
    publicationError: null,
  };
}

export type PokeFramePublicationSummary = {
  publicationId: string;
  publishedAt: string;
  publisher: string | null;
  isActive: boolean;
  functionCount: number;
  invocationCount: number;
};

export type PokeListFramePublications = {
  items: PokeFramePublicationSummary[];
};

/**
 * Every publication of `frame` still on record, newest first, with the function and invocation
 * counts that explain why a superseded one has not been purged yet.
 */
export async function listFramePublications(
  auth: Authenticator,
  frame: FileResource
): Promise<PokeFramePublicationSummary[]> {
  const [publications, sandboxFunctions, invocationCountsByPublicationId] =
    await Promise.all([
      FramePublicationResource.listForFrame(auth, frame),
      SandboxFunctionResource.listByFrame(auth, frame),
      SandboxFunctionResource.countInvocationsByFramePublication(auth, frame),
    ]);
  const publishers = await UserResource.fetchByModelIds([
    ...new Set(
      removeNulls(
        publications.map(({ publishedByUserId }) => publishedByUserId)
      )
    ),
  ]);
  const publisherNamesByModelId = new Map(
    publishers.map((user) => [user.id, user.fullName()])
  );
  const functionCountsByPublicationId = countBy(
    sandboxFunctions,
    ({ publicationId }) => publicationId
  );
  const activePublicationId =
    frame.useCaseMetadata?.activePublicationId ?? null;

  return publications.map((publication) =>
    publication.toPokeJSON({
      activePublicationId,
      functionCount:
        functionCountsByPublicationId[publication.publicationId] ?? 0,
      invocationCount:
        invocationCountsByPublicationId.get(publication.publicationId) ?? 0,
      publisher: publication.publishedByUserId
        ? (publisherNamesByModelId.get(publication.publishedByUserId) ?? null)
        : null,
    })
  );
}

/**
 * A Frame function's `fileId` is the Frame manifest rather than its published bundle, which is why
 * the bundle is addressed by `slug` below instead.
 */
export type PokeFrameFunction = {
  sId: string;
  // Also the key the published bundle is stored under: createForFramePublication sets
  // `slug: fn.name`, and Frames have no app prefix to strip.
  slug: string;
  description: string;
  publicationId: string;
  createdAt: string;
  updatedAt: string;
};

export type PokeFrameFunctionDetails = PokeFrameFunction & {
  userIdentity: SandboxFunctionUserIdentityPolicy | null;
  executionMode: SandboxFunctionExecutionMode;
  defaultStake: SandboxFunctionStake;
  bundleSha256: string | null;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  isActivePublication: boolean;
};

export type PokeListFrameFunctions = {
  items: PokeFrameFunction[];
};

/**
 * A Frame function by name: the name is stable across publications, while each publication that
 * declares it adds a version (its own row and sId).
 */
export type PokeFrameFunctionName = {
  slug: string;
  // From the latest version.
  description: string;
  versionCount: number;
  invocationCount: number;
  isInActivePublication: boolean;
};

export type PokeListFrameFunctionNames = {
  items: PokeFrameFunctionName[];
};

export type PokeFrameFunctionVersion = PokeFrameFunction & {
  bundleSha256: string | null;
  isActivePublication: boolean;
  invocationCount: number;
};

export type PokeGetFrameFunctionVersions = {
  slug: string;
  versions: PokeFrameFunctionVersion[];
};

export type PokeGetFrameFunction = {
  frameFunction: PokeFrameFunctionDetails;
};

export type PokeGetFrameFunctionSource = {
  source: string;
};

// Superseded by `listFrameFunctionNames`; kept until the poke SPA no longer calls it.
export async function listFrameFunctions(
  auth: Authenticator,
  frame: FileResource
): Promise<PokeFrameFunction[]> {
  const publicationId = frame.useCaseMetadata?.activePublicationId;
  if (!publicationId) {
    return [];
  }

  const sandboxFunctions = await SandboxFunctionResource.listByFramePublication(
    auth,
    { frame, publicationId }
  );

  return sandboxFunctions.map((sandboxFunction) =>
    sandboxFunction.toPokeFrameJSON()
  );
}

/**
 * Every function name `frame` still has rows for, across all its publications, alphabetically.
 * Superseded versions stay until retention purges them, so their invocations remain reachable.
 */
export async function listFrameFunctionNames(
  auth: Authenticator,
  frame: FileResource
): Promise<PokeFrameFunctionName[]> {
  const [sandboxFunctions, invocationCountsByFunctionModelId] =
    await Promise.all([
      SandboxFunctionResource.listByFrame(auth, frame),
      SandboxFunctionResource.countInvocationsByFrameFunction(auth, frame),
    ]);
  const activePublicationId =
    frame.useCaseMetadata?.activePublicationId ?? null;

  // listByFrame is newest first, so each group's first version is its latest.
  return Object.entries(groupBy(sandboxFunctions, ({ slug }) => slug))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, versions]) =>
      versions[0].toPokeFrameFunctionNameJSON({
        invocationCount: sumBy(
          versions,
          ({ id }) => invocationCountsByFunctionModelId.get(id) ?? 0
        ),
        isInActivePublication: versions.some(
          ({ publicationId }) => publicationId === activePublicationId
        ),
        versionCount: versions.length,
      })
    );
}

/**
 * Every version of the function named `slug` still on record, newest first. Empty when `frame` has
 * no function of that name.
 */
export async function listFrameFunctionVersions(
  auth: Authenticator,
  { frame, slug }: { frame: FileResource; slug: string }
): Promise<PokeFrameFunctionVersion[]> {
  const [versions, invocationCountsByFunctionModelId] = await Promise.all([
    SandboxFunctionResource.listByFrameAndSlug(auth, { frame, slug }),
    SandboxFunctionResource.countInvocationsByFrameFunction(auth, frame),
  ]);
  const activePublicationId =
    frame.useCaseMetadata?.activePublicationId ?? null;

  return versions.map((version) =>
    version.toPokeFrameFunctionVersionJSON({
      activePublicationId,
      invocationCount: invocationCountsByFunctionModelId.get(version.id) ?? 0,
    })
  );
}

/**
 * The newest invocations across every version of the function named `slug`, or null when `frame`
 * has no function of that name.
 */
export async function listFrameFunctionNameInvocations(
  auth: Authenticator,
  {
    frame,
    limit,
    origins,
    slug,
    statuses,
  }: {
    frame: FileResource;
    limit: number;
    origins?: SandboxFunctionInvocationOrigin[];
    slug: string;
    statuses?: SandboxFunctionInvocationStatus[];
  }
): Promise<PokeSandboxFunctionInvocation[] | null> {
  const versions = await SandboxFunctionResource.listByFrameAndSlug(auth, {
    frame,
    slug,
  });
  if (versions.length === 0) {
    return null;
  }

  return listSandboxFunctionInvocations(auth, {
    sandboxFunctions: versions,
    limit,
    statuses,
    origins,
  });
}

export async function getFrameFunctionSource(
  auth: Authenticator,
  {
    frame,
    sandboxFunction,
  }: { frame: FileResource; sandboxFunction: SandboxFunctionResource }
): Promise<Result<string, FramePublicationError>> {
  const { publicationId } = sandboxFunction;

  return readFramePublicationFunctionBundle(auth, {
    frame,
    publicationId,
    functionName: sandboxFunction.slug,
  });
}

// Mirrors `LiveDatabaseEntry` from the sandbox-functions layer, but declared here so client code
// (the SWR hook, the table component) never imports that server-internal module (see
// `PokePodDatabase` in `lib/api/poke/projects.ts` for the same pattern on the pod side).
export type PokeFrameDatabase = LiveDatabaseEntry;

export type PokeListFrameDatabases = {
  items: PokeFrameDatabase[];
};
