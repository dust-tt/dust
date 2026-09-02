import path from "node:path";

import { loadFramePublicationDescriptor } from "@app/lib/api/frames/publication_storage";
import type { PokePodFunction } from "@app/lib/api/poke/projects";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { listDatabasesOnReadySandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import filestorageConfig from "@app/lib/file_storage/config";
import { makeGcsConsoleUrl, makeGcsUri } from "@app/lib/poke/gcs";
import { FileResource } from "@app/lib/resources/file_resource";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { UserResource } from "@app/lib/resources/user_resource";
import {
  getFrameBasePath,
  getFrameDatabaseReplicasBasePath,
  getFramePublicationsBasePath,
} from "@app/types/api/frame_storage";
import type { FileStatus } from "@app/types/files";
import type { PokeSandboxType } from "@app/types/poke";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

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
  hasMore: boolean;
  lastValue: string | null;
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
    name: frame.useCaseMetadata?.frameName ?? null,
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
  pagination: {
    limit: number;
    lastValue?: string;
    orderDirection: "asc" | "desc";
  }
): Promise<PokeListFrames> {
  const { frames, hasMore, lastValue } =
    await FileResource.listFrameV2ForWorkspacePaginated(auth, pagination);

  if (frames.length === 0) {
    return { items: [], hasMore, lastValue };
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
    hasMore,
    lastValue,
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

export type PokeFrameDetails = {
  frame: PokeFrameListItem;
  sandbox: PokeSandboxType | null;
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
    {
      label: "Publications",
      prefix: getFramePublicationsBasePath({
        workspaceId,
        frameId: frame.sId,
      }),
    },
    {
      label: "Database replicas",
      prefix: getFrameDatabaseReplicasBasePath({
        workspaceId,
        frameId: frame.sId,
      }),
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

  const [functionCounts, authors, sandbox] = await Promise.all([
    SandboxFunctionResource.countByFrameModelIds(auth, [
      { frameModelId: frame.id, activePublicationId: publicationId },
    ]),
    UserResource.fetchByModelIds(removeNulls([frame.userId])),
    FrameSandboxAdapter.fetchSandbox(auth, frame),
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

export type PokeListFrameFunctions = {
  items: PokePodFunction[];
};

export async function listFrameFunctions(
  auth: Authenticator,
  frame: FileResource
): Promise<PokePodFunction[]> {
  const publicationId = frame.useCaseMetadata?.activePublicationId;
  if (!publicationId) {
    return [];
  }

  const sandboxFunctions = await SandboxFunctionResource.listByFramePublication(
    auth,
    { frame, publicationId }
  );

  const authors = await UserResource.fetchByModelIds(
    removeNulls(
      sandboxFunctions.map((sandboxFunction) => sandboxFunction.file.userId)
    )
  );
  const authorsByModelId = new Map(authors.map((user) => [user.id, user]));

  return sandboxFunctions.map((sandboxFunction) => {
    const { userId } = sandboxFunction.file;

    return sandboxFunction.toPokeJSON(
      userId !== null ? (authorsByModelId.get(userId) ?? null) : null
    );
  });
}

// Mirrors `LiveDatabaseEntry` from the sandbox-functions layer, but declared here so client code
// (the SWR hook, the table component) never imports that server-internal module (see
// `PokePodDatabase` in `lib/api/poke/projects.ts` for the same pattern on the pod side).
export type PokeFrameDatabase = {
  name: string;
  sizeBytes: number;
};

export type PokeListFrameDatabases = {
  items: PokeFrameDatabase[];
};

/**
 * There is no database-backed record of a Frame's databases: the only source of truth is the live
 * `{db}.db` files in the Frame sandbox, so this wakes (or cold starts) it. Poke fetches it on
 * explicit user action only.
 */
export async function listFrameDatabases(
  auth: Authenticator,
  frame: FileResource
): Promise<Result<PokeFrameDatabase[], SandboxFunctionError>> {
  const ensureResult = await ensureFrameSandboxReady(auth, frame);
  if (ensureResult.isErr()) {
    return new Err(
      new SandboxFunctionError(
        "sandbox_unavailable",
        ensureResult.error.message
      )
    );
  }

  const databasesResult = await listDatabasesOnReadySandbox(
    auth,
    ensureResult.value.sandbox
  );
  if (databasesResult.isErr()) {
    return databasesResult;
  }

  return new Ok(
    databasesResult.value.map((entry) => ({
      name: entry.name,
      sizeBytes: entry.sizeBytes,
    }))
  );
}
