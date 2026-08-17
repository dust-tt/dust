import { randomUUID } from "node:crypto";
import { MIMEType } from "node:util";
import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemContentType,
  FileSystemContentUploadType,
  FileSystemNodeType,
  FileSystemOperation,
} from "@app/lib/api/file_system/namespace_types";
import {
  FILE_SYSTEM_CONTENT_MAX_BYTES,
  FILE_SYSTEM_CONTENT_TYPE_MAX_LENGTH,
  FILE_SYSTEM_EXECUTABLE_BITS_MASK,
  FILE_SYSTEM_MODE_LIMITS,
  FILE_SYSTEM_NAME_MAX_BYTES,
  FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS,
  FileSystemOperationError,
} from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import {
  getFileSystemBlobDownloadUrl,
  getFileSystemBlobMetadata,
  prepareFileSystemBlobUpload,
} from "@app/lib/file_storage/file_system_blobs";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileSystemBlobCleanupResource } from "@app/lib/resources/file_system_blob_cleanup_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import {
  contentTypeFromFileName,
  normalizeMimeType,
  resolveFileContentType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, Transaction } from "sequelize";
import { Op, QueryTypes } from "sequelize";
import { z } from "zod";

type ReadDirRequest = Extract<FileSystemOperation, { operation: "readDir" }>;
type ReadDirOptions = Pick<ReadDirRequest, "afterName" | "limit">;
type CreateRequest = Extract<FileSystemOperation, { operation: "create" }>;
type CreateOptions = Pick<CreateRequest, "kind" | "mode" | "name">;
type RemoveRequest = Extract<FileSystemOperation, { operation: "remove" }>;
type RemoveChildOptions = Pick<RemoveRequest, "kind" | "name"> & {
  transaction: Transaction;
};
type RenameRequest = Extract<FileSystemOperation, { operation: "rename" }>;
type RenameChildOptions = Pick<
  RenameRequest,
  "destinationName" | "sourceName"
> & {
  destinationParent: FileSystemNodeResource;
  transaction: Transaction;
};
type MoveOptions = Pick<
  RenameChildOptions,
  "destinationName" | "transaction"
> & {
  destinationParent: FileSystemNodeResource;
};
type PrepareContentUploadRequest = Extract<
  FileSystemOperation,
  { operation: "prepareContentUpload" }
>;
type PrepareContentUploadOptions = Pick<
  PrepareContentUploadRequest,
  "contentType" | "expectedBlobId" | "expectedSizeBytes"
>;
type CommitContentUploadRequest = Extract<
  FileSystemOperation,
  { operation: "commitContentUpload" }
>;
type CommitContentUploadOptions = Pick<
  CommitContentUploadRequest,
  "blobId" | "contentType" | "expectedBlobId" | "expectedSizeBytes"
>;
const FileSystemBlobIdSchema = z.string().uuid();
type SetExecutableBitsRequest = Extract<
  FileSystemOperation,
  { operation: "setExecutableBits" }
>;
type SetExecutableBitsOptions = Pick<
  SetExecutableBitsRequest,
  "executableBits"
>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FileSystemNodeResource
  extends ReadonlyAttributesType<FileSystemNodeModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FileSystemNodeResource extends BaseResource<FileSystemNodeModel> {
  static model: ModelStaticWorkspaceAware<FileSystemNodeModel> =
    FileSystemNodeModel;

  constructor(
    model: ModelStaticWorkspaceAware<FileSystemNodeModel>,
    blob: Attributes<FileSystemNodeModel>
  ) {
    super(model, blob);
  }

  override delete(): Promise<Result<undefined, Error>> {
    // Removing a node must also save the successful request and queue its blob
    // for deletion, so it must go through the filesystem remove operation.
    throw new Error("Filesystem nodes cannot be deleted directly.");
  }

  private static async baseFetch(
    auth: Authenticator,
    scope: FileSystemScope,
    options: ResourceFindOptions<FileSystemNodeModel> = {},
    {
      transaction,
      forUpdate = false,
    }: { transaction?: Transaction; forUpdate?: boolean } = {}
  ): Promise<FileSystemNodeResource[]> {
    const readableRoots = scope.readableRoots();
    if (readableRoots.length === 0) {
      return [];
    }

    const { where, ...otherOptions } = options;
    const rows = await this.model.findAll({
      ...otherOptions,
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
        [Op.or]: readableRoots.map((root) => ({
          rootKind: root.kind,
          rootId: root.id,
        })),
      },
      transaction,
      ...(transaction && forUpdate ? { lock: transaction.LOCK.UPDATE } : {}),
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  private static async makeNew(
    parent: FileSystemNodeResource,
    request: CreateOptions,
    transaction: Transaction
  ): Promise<FileSystemNodeResource> {
    const row = await this.model.create(
      {
        workspaceId: parent.workspaceId,
        parentId: parent.id,
        rootKind: parent.rootKind,
        rootId: parent.rootId,
        name: request.name,
        kind: request.kind,
        mode: request.mode,
        size: 0,
        contentType: null,
        blobId: null,
        contentRevision: 0,
      },
      { transaction }
    );

    return new this(this.model, row.get());
  }

  static async ensureRoots(
    auth: Authenticator,
    scope: FileSystemScope
  ): Promise<FileSystemNodeResource[]> {
    const readableRoots = scope.readableRoots();
    if (readableRoots.length === 0) {
      return [];
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    await this.model.bulkCreate(
      readableRoots.map((root) => ({
        workspaceId,
        parentId: null,
        rootKind: root.kind,
        rootId: root.id,
        name: root.name,
        kind: "directory" as const,
        mode: 0o755,
        size: 0,
        contentType: null,
        blobId: null,
        contentRevision: 0,
      })),
      { ignoreDuplicates: true }
    );

    const roots = await this.baseFetch(auth, scope, {
      where: { parentId: null },
    });
    const rootsByKey = new Map(
      roots.map((root) => [`${root.rootKind}:${root.rootId}`, root])
    );

    return readableRoots.map((allowedRoot) => {
      const root = rootsByKey.get(`${allowedRoot.kind}:${allowedRoot.id}`);
      if (!root) {
        throw new Error(
          `Filesystem root ${allowedRoot.kind}:${allowedRoot.id} is missing.`
        );
      }
      return root;
    });
  }

  static async fetchById(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number,
    options: { transaction?: Transaction; forUpdate?: boolean } = {}
  ): Promise<FileSystemNodeResource | null> {
    const [node] = await this.baseFetch(
      auth,
      scope,
      {
        where: { id: nodeId },
        limit: 1,
      },
      options
    );
    return node ?? null;
  }

  private static validateName(
    name: string
  ): Result<undefined, FileSystemOperationError> {
    const nameLengthBytes = Buffer.byteLength(name, "utf8");
    if (
      name === "." ||
      name === ".." ||
      name.includes("/") ||
      name.includes("\0") ||
      nameLengthBytes === 0 ||
      nameLengthBytes > FILE_SYSTEM_NAME_MAX_BYTES
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `A file name must be between 1 and ${FILE_SYSTEM_NAME_MAX_BYTES} bytes and cannot contain a slash or null byte.`
        )
      );
    }

    return new Ok(undefined);
  }

  private isReadableBy(auth: Authenticator, scope: FileSystemScope): boolean {
    return (
      this.workspaceId === auth.getNonNullableWorkspace().id &&
      scope.canRead(this.rootKind, this.rootId)
    );
  }

  private isWritableBy(auth: Authenticator, scope: FileSystemScope): boolean {
    return (
      this.workspaceId === auth.getNonNullableWorkspace().id &&
      scope.canWrite(this.rootKind, this.rootId)
    );
  }

  private async fetchChildByName(
    auth: Authenticator,
    scope: FileSystemScope,
    name: string,
    {
      transaction,
      forUpdate = false,
    }: { transaction?: Transaction; forUpdate?: boolean } = {}
  ): Promise<FileSystemNodeResource | null> {
    const [child] = await FileSystemNodeResource.baseFetch(
      auth,
      scope,
      {
        where: { parentId: this.id, name },
        limit: 1,
      },
      { transaction, forUpdate }
    );

    return child ?? null;
  }

  private checkWritableDirectory(
    auth: Authenticator,
    scope: FileSystemScope,
    { description }: { description: string }
  ): Result<undefined, FileSystemOperationError> {
    if (!this.isReadableBy(auth, scope) || this.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          `The ${description} directory was not found.`
        )
      );
    }
    if (!this.isWritableBy(auth, scope)) {
      return new Err(
        new FileSystemOperationError(
          "unauthorized",
          `You do not have write access to the ${description} directory.`
        )
      );
    }

    return new Ok(undefined);
  }

  private async fetchChildForUpdate(
    auth: Authenticator,
    scope: FileSystemScope,
    { name, transaction }: { name: string; transaction: Transaction }
  ): Promise<Result<FileSystemNodeResource | null, FileSystemOperationError>> {
    const nameRes = FileSystemNodeResource.validateName(name);
    if (nameRes.isErr()) {
      return nameRes;
    }

    return new Ok(
      await this.fetchChildByName(auth, scope, name, {
        transaction,
        forUpdate: true,
      })
    );
  }

  async createChild(
    auth: Authenticator,
    scope: FileSystemScope,
    request: CreateOptions,
    transaction: Transaction
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    const accessRes = this.checkWritableDirectory(auth, scope, {
      description: "parent",
    });
    if (accessRes.isErr()) {
      return accessRes;
    }
    const nameRes = FileSystemNodeResource.validateName(request.name);
    if (nameRes.isErr()) {
      return nameRes;
    }
    if (
      !Number.isInteger(request.mode) ||
      request.mode < FILE_SYSTEM_MODE_LIMITS.min ||
      request.mode > FILE_SYSTEM_MODE_LIMITS.max
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `File mode must be between ${FILE_SYSTEM_MODE_LIMITS.min} and ${FILE_SYSTEM_MODE_LIMITS.max}.`
        )
      );
    }

    const existing = await this.fetchChildByName(auth, scope, request.name, {
      transaction,
    });
    if (existing) {
      return new Err(
        new FileSystemOperationError(
          "already_exists",
          `${request.name} already exists.`
        )
      );
    }

    return new Ok(
      await FileSystemNodeResource.makeNew(this, request, transaction)
    );
  }

  async lookupChild(
    auth: Authenticator,
    scope: FileSystemScope,
    name: string
  ): Promise<Result<FileSystemNodeResource | null, FileSystemOperationError>> {
    if (!this.isReadableBy(auth, scope) || this.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The parent directory was not found."
        )
      );
    }

    return new Ok(await this.fetchChildByName(auth, scope, name));
  }

  async setExecutableBits(
    auth: Authenticator,
    scope: FileSystemScope,
    { executableBits }: SetExecutableBitsOptions
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    if (!this.isReadableBy(auth, scope)) {
      return new Err(
        new FileSystemOperationError("not_found", "The inode was not found.")
      );
    }
    if (!this.isWritableBy(auth, scope)) {
      return new Err(
        new FileSystemOperationError(
          "unauthorized",
          "You do not have write access to this inode."
        )
      );
    }
    if (
      !Number.isInteger(executableBits) ||
      executableBits < 0 ||
      (executableBits & ~FILE_SYSTEM_EXECUTABLE_BITS_MASK) !== 0
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "Only user, group, and other executable bits can be changed."
        )
      );
    }

    // Keep read, write, and special bits unchanged.
    const mode =
      (this.mode & ~FILE_SYSTEM_EXECUTABLE_BITS_MASK) | executableBits;
    const [updatedCount] = await this.update({ mode });
    if (updatedCount !== 1) {
      return new Err(
        new FileSystemOperationError("not_found", "The inode was not found.")
      );
    }

    return new Ok(this);
  }

  async readDir(
    auth: Authenticator,
    scope: FileSystemScope,
    options: ReadDirOptions
  ): Promise<
    Result<
      { nodes: FileSystemNodeResource[]; nextAfterName: string | null },
      FileSystemOperationError
    >
  > {
    if (
      !Number.isInteger(options.limit) ||
      options.limit < FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS.min ||
      options.limit > FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS.max
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `Directory page size must be between ${FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS.min} and ${FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS.max}.`
        )
      );
    }

    if (!this.isReadableBy(auth, scope) || this.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The directory was not found."
        )
      );
    }

    const nodes = await FileSystemNodeResource.baseFetch(auth, scope, {
      where: {
        parentId: this.id,
        ...(options.afterName ? { name: { [Op.gt]: options.afterName } } : {}),
      },
      order: [["name", "ASC"]],
      limit: options.limit + 1,
    });
    const page = nodes.slice(0, options.limit);

    return new Ok({
      nodes: page,
      nextAfterName:
        nodes.length > options.limit ? (page.at(-1)?.name ?? null) : null,
    });
  }

  private async isAncestorOf(
    possibleDescendant: FileSystemNodeResource,
    transaction: Transaction
  ): Promise<boolean> {
    // Each row only stores its parentId. To stop a directory from being moved
    // inside itself, this query follows parentId until it reaches a root. Its
    // work grows with the number of parent directories, not the number of
    // children. Keep recursive SQL out of normal reads.
    // biome-ignore lint/plugin/noRawSql: Sequelize cannot follow parentId until the root.
    const rows = await frontSequelize.query<{ found: number }>(
      `
        WITH RECURSIVE ancestors AS (
          SELECT "id", "parentId"
          FROM "file_system_nodes"
          WHERE "workspaceId" = :workspaceId AND "id" = :nodeId

          UNION

          SELECT parent."id", parent."parentId"
          FROM "file_system_nodes" parent
          JOIN ancestors child ON parent."id" = child."parentId"
          WHERE parent."workspaceId" = :workspaceId
        )
        SELECT 1 AS "found"
        FROM ancestors
        WHERE "id" = :ancestorId
        LIMIT 1
      `,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: {
          workspaceId: this.workspaceId,
          nodeId: possibleDescendant.id,
          ancestorId: this.id,
        },
      }
    );

    return rows.length > 0;
  }

  private async isEmptyDirectory(transaction: Transaction): Promise<boolean> {
    if (this.kind !== "directory") {
      return true;
    }

    // Look for children by parentId, without filtering on rootKind or rootId.
    // Wrong copied root values must never let us delete a non-empty directory.
    const child = await this.model.findOne({
      attributes: ["id"],
      where: { workspaceId: this.workspaceId, parentId: this.id },
      transaction,
    });
    return child === null;
  }

  private async destroyAndRetireBlob(
    auth: Authenticator,
    transaction: Transaction
  ): Promise<void> {
    if (this.blobId !== null) {
      await FileSystemBlobCleanupResource.retireBlob(auth, this, {
        blobId: this.blobId,
        transaction,
      });
    }

    const deletedCount = await this.model.destroy({
      where: { workspaceId: this.workspaceId, id: this.id },
      transaction,
    });
    if (deletedCount !== 1) {
      throw new Error(`Failed to remove filesystem node ${this.id}.`);
    }
  }

  async removeChild(
    auth: Authenticator,
    scope: FileSystemScope,
    options: RemoveChildOptions
  ): Promise<Result<undefined, FileSystemOperationError>> {
    const accessRes = this.checkWritableDirectory(auth, scope, {
      description: "parent",
    });
    if (accessRes.isErr()) {
      return accessRes;
    }

    const childRes = await this.fetchChildForUpdate(auth, scope, {
      name: options.name,
      transaction: options.transaction,
    });
    if (childRes.isErr()) {
      return childRes;
    }
    const child = childRes.value;
    if (!child) {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          `${options.name} was not found.`
        )
      );
    }

    if (options.kind === "file" && child.kind === "directory") {
      return new Err(
        new FileSystemOperationError(
          "is_directory",
          "A directory cannot be removed as a file."
        )
      );
    }
    if (options.kind === "directory" && child.kind === "file") {
      return new Err(
        new FileSystemOperationError(
          "not_directory",
          "A file cannot be removed as a directory."
        )
      );
    }
    if (!(await child.isEmptyDirectory(options.transaction))) {
      return new Err(
        new FileSystemOperationError("not_empty", "The directory is not empty.")
      );
    }

    await child.destroyAndRetireBlob(auth, options.transaction);
    return new Ok(undefined);
  }

  private async moveDescendantsToRoot(
    destinationParent: FileSystemNodeResource,
    transaction: Transaction
  ): Promise<void> {
    // Every row stores rootKind and rootId so permission checks do not need to
    // follow parentId. A cross-root move must therefore update every child of
    // the moved directory. The workspace lock blocks creates and other renames
    // until this finishes. If large moves become slow, reconsider copying the
    // root onto every row instead of adding more recursive SQL.
    // Do not change updatedAt: moving a parent did not change a child's bytes.
    // biome-ignore lint/plugin/noRawSql: Sequelize cannot update a whole directory tree.
    await frontSequelize.query(
      `
        WITH RECURSIVE subtree AS (
          SELECT "id"
          FROM "file_system_nodes"
          WHERE "workspaceId" = :workspaceId AND "id" = :sourceNodeId

          UNION

          SELECT child."id"
          FROM "file_system_nodes" child
          JOIN subtree parent ON child."parentId" = parent."id"
          WHERE child."workspaceId" = :workspaceId
        )
        UPDATE "file_system_nodes"
        SET "rootKind" = :rootKind, "rootId" = :rootId
        WHERE "workspaceId" = :workspaceId
          AND "id" IN (SELECT "id" FROM subtree)
          AND "id" <> :sourceNodeId
      `,
      {
        transaction,
        replacements: {
          workspaceId: this.workspaceId,
          sourceNodeId: this.id,
          rootKind: destinationParent.rootKind,
          rootId: destinationParent.rootId,
        },
      }
    );
  }

  private async moveTo(
    auth: Authenticator,
    scope: FileSystemScope,
    options: MoveOptions
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    const nameRes = FileSystemNodeResource.validateName(
      options.destinationName
    );
    if (nameRes.isErr()) {
      return nameRes;
    }

    if (
      this.parentId === options.destinationParent.id &&
      this.name === options.destinationName
    ) {
      return new Ok(this);
    }

    if (
      this.kind === "directory" &&
      (await this.isAncestorOf(options.destinationParent, options.transaction))
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "A directory cannot be moved inside itself."
        )
      );
    }

    const destination = await options.destinationParent.fetchChildByName(
      auth,
      scope,
      options.destinationName,
      { transaction: options.transaction, forUpdate: true }
    );
    if (destination?.kind === "directory" && this.kind === "file") {
      return new Err(
        new FileSystemOperationError(
          "is_directory",
          "A file cannot replace a directory."
        )
      );
    }
    if (destination?.kind === "file" && this.kind === "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_directory",
          "A directory cannot replace a file."
        )
      );
    }
    if (
      destination &&
      !(await destination.isEmptyDirectory(options.transaction))
    ) {
      return new Err(
        new FileSystemOperationError(
          "not_empty",
          "The destination directory is not empty."
        )
      );
    }

    if (destination) {
      await destination.destroyAndRetireBlob(auth, options.transaction);
    }

    const changesRoot =
      this.rootKind !== options.destinationParent.rootKind ||
      this.rootId !== options.destinationParent.rootId;
    if (this.kind === "directory" && changesRoot) {
      await this.moveDescendantsToRoot(
        options.destinationParent,
        options.transaction
      );
    }

    await this.update(
      {
        parentId: options.destinationParent.id,
        name: options.destinationName,
        rootKind: options.destinationParent.rootKind,
        rootId: options.destinationParent.rootId,
      },
      options.transaction
    );

    return new Ok(this);
  }

  async renameChild(
    auth: Authenticator,
    scope: FileSystemScope,
    options: RenameChildOptions
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    const sourceAccessRes = this.checkWritableDirectory(auth, scope, {
      description: "source",
    });
    if (sourceAccessRes.isErr()) {
      return sourceAccessRes;
    }
    const destinationAccessRes =
      options.destinationParent.checkWritableDirectory(auth, scope, {
        description: "destination",
      });
    if (destinationAccessRes.isErr()) {
      return destinationAccessRes;
    }

    const sourceRes = await this.fetchChildForUpdate(auth, scope, {
      name: options.sourceName,
      transaction: options.transaction,
    });
    if (sourceRes.isErr()) {
      return sourceRes;
    }
    if (!sourceRes.value) {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          `${options.sourceName} was not found.`
        )
      );
    }

    return sourceRes.value.moveTo(auth, scope, options);
  }

  private checkContentAccess(
    auth: Authenticator,
    scope: FileSystemScope,
    { write }: { write: boolean }
  ): Result<undefined, FileSystemOperationError> {
    if (!this.isReadableBy(auth, scope)) {
      return new Err(
        new FileSystemOperationError("not_found", "The file was not found.")
      );
    }
    if (this.kind !== "file") {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "A directory has no file content."
        )
      );
    }
    if (write && !this.isWritableBy(auth, scope)) {
      return new Err(
        new FileSystemOperationError(
          "unauthorized",
          "You do not have write access to this file."
        )
      );
    }

    return new Ok(undefined);
  }

  private static isValidContentType(contentType: string): boolean {
    if (
      contentType.length === 0 ||
      contentType.length > FILE_SYSTEM_CONTENT_TYPE_MAX_LENGTH
    ) {
      return false;
    }

    try {
      return new MIMEType(contentType).essence === contentType;
    } catch {
      return false;
    }
  }

  private static isValidContentSize(sizeBytes: number): boolean {
    return (
      Number.isSafeInteger(sizeBytes) &&
      sizeBytes >= 0 &&
      sizeBytes <= FILE_SYSTEM_CONTENT_MAX_BYTES
    );
  }

  async getContent(
    auth: Authenticator,
    scope: FileSystemScope
  ): Promise<Result<FileSystemContentType, FileSystemOperationError>> {
    const accessRes = this.checkContentAccess(auth, scope, { write: false });
    if (accessRes.isErr()) {
      return accessRes;
    }

    if (this.blobId === null) {
      return new Ok({
        blobId: null,
        downloadUrl: null,
        size: Number(this.size),
        contentType: this.contentType,
      });
    }

    return new Ok({
      blobId: this.blobId,
      downloadUrl: await getFileSystemBlobDownloadUrl(
        auth,
        this.id,
        this.blobId
      ),
      size: Number(this.size),
      contentType: this.contentType,
    });
  }

  async prepareContentUpload(
    auth: Authenticator,
    scope: FileSystemScope,
    request: PrepareContentUploadOptions
  ): Promise<Result<FileSystemContentUploadType, FileSystemOperationError>> {
    const accessRes = this.checkContentAccess(auth, scope, { write: true });
    if (accessRes.isErr()) {
      return accessRes;
    }
    if (
      request.expectedBlobId !== null &&
      !FileSystemBlobIdSchema.safeParse(request.expectedBlobId).success
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The expected blob ID is invalid."
        )
      );
    }
    if (this.blobId !== request.expectedBlobId) {
      return new Err(
        new FileSystemOperationError(
          "stale",
          "The file changed after it was opened."
        )
      );
    }
    if (!FileSystemNodeResource.isValidContentSize(request.expectedSizeBytes)) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `Content size must be between 0 and ${FILE_SYSTEM_CONTENT_MAX_BYTES} bytes.`
        )
      );
    }

    const requestedContentType = request.contentType.trim();
    if (
      requestedContentType.length === 0 ||
      requestedContentType.length > FILE_SYSTEM_CONTENT_TYPE_MAX_LENGTH
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `Content type must be between 1 and ${FILE_SYSTEM_CONTENT_TYPE_MAX_LENGTH} characters.`
        )
      );
    }
    let normalizedRequestedContentType: string;
    try {
      normalizedRequestedContentType = new MIMEType(requestedContentType)
        .essence;
    } catch {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "Content type must be a valid MIME type."
        )
      );
    }
    const contentType = normalizeMimeType(
      contentTypeFromFileName(this.name) ??
        resolveFileContentType(normalizedRequestedContentType, this.name)
    );
    if (!FileSystemNodeResource.isValidContentType(contentType)) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `Resolved content type must be between 1 and ${FILE_SYSTEM_CONTENT_TYPE_MAX_LENGTH} characters.`
        )
      );
    }

    const blobId = randomUUID();
    await FileSystemBlobCleanupResource.registerUpload(auth, this, { blobId });
    const { uploadUrl, headers } = await prepareFileSystemBlobUpload(
      auth,
      this.id,
      blobId,
      contentType,
      request.expectedSizeBytes
    );

    return new Ok({
      blobId,
      uploadUrl,
      contentType,
      expectedSizeBytes: request.expectedSizeBytes,
      headers,
    });
  }

  async commitContentUpload(
    auth: Authenticator,
    scope: FileSystemScope,
    request: CommitContentUploadOptions
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    const accessRes = this.checkContentAccess(auth, scope, { write: true });
    if (accessRes.isErr()) {
      return accessRes;
    }
    if (
      !FileSystemBlobIdSchema.safeParse(request.blobId).success ||
      (request.expectedBlobId !== null &&
        !FileSystemBlobIdSchema.safeParse(request.expectedBlobId).success)
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The content request contains an invalid blob ID."
        )
      );
    }
    if (!FileSystemNodeResource.isValidContentType(request.contentType)) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `Content type must be between 1 and ${FILE_SYSTEM_CONTENT_TYPE_MAX_LENGTH} characters.`
        )
      );
    }
    if (!FileSystemNodeResource.isValidContentSize(request.expectedSizeBytes)) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `Content size must be between 0 and ${FILE_SYSTEM_CONTENT_MAX_BYTES} bytes.`
        )
      );
    }
    if (
      this.blobId !== request.blobId &&
      this.blobId !== request.expectedBlobId
    ) {
      return new Err(
        new FileSystemOperationError(
          "stale",
          "The file changed while content was uploading."
        )
      );
    }

    // A successful commit whose response was lost must not depend on GCS
    // being available when the same commit is retried.
    if (this.blobId === request.blobId) {
      return withTransaction((transaction) =>
        this.confirmCommittedBlob(auth, scope, request, transaction)
      );
    }

    let metadata: {
      size: number;
      contentType: string | undefined;
      contentEncoding: string | undefined;
      contentDisposition: string | undefined;
    };
    try {
      metadata = await getFileSystemBlobMetadata(auth, this.id, request.blobId);
    } catch (error) {
      logger.warn(
        {
          err: normalizeError(error),
          nodeId: this.id,
          blobId: request.blobId,
        },
        "Dust filesystem could not verify an uploaded blob"
      );
      if (isGCSNotFoundError(error)) {
        return new Err(
          new FileSystemOperationError(
            "not_found",
            "The uploaded object was not found."
          )
        );
      }
      throw normalizeError(error);
    }
    if (!Number.isSafeInteger(metadata.size) || metadata.size < 0) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The uploaded object has an invalid size."
        )
      );
    }
    if (metadata.size !== request.expectedSizeBytes) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The uploaded object's size does not match the request."
        )
      );
    }
    if (metadata.contentType !== request.contentType) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The uploaded object's content type does not match the request."
        )
      );
    }
    // Encodings such as gzip can change the bytes clients receive. Identity
    // means GCS serves the uploaded bytes unchanged.
    if (
      metadata.contentEncoding !== undefined &&
      metadata.contentEncoding.toLowerCase() !== "identity"
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The uploaded object must use identity content encoding."
        )
      );
    }
    if (metadata.contentDisposition !== undefined) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The uploaded object cannot set content disposition."
        )
      );
    }

    return withTransaction(async (transaction) => {
      const current = await FileSystemNodeResource.fetchById(
        auth,
        scope,
        this.id,
        { transaction, forUpdate: true }
      );
      if (!current) {
        return new Err(
          new FileSystemOperationError("not_found", "The file was not found.")
        );
      }

      return current.attachUploadedBlob(
        auth,
        scope,
        request,
        metadata.size,
        transaction
      );
    });
  }

  private async confirmCommittedBlob(
    auth: Authenticator,
    scope: FileSystemScope,
    request: CommitContentUploadOptions,
    transaction: Transaction
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    const current = await FileSystemNodeResource.fetchById(
      auth,
      scope,
      this.id,
      { transaction, forUpdate: true }
    );
    if (!current) {
      return new Err(
        new FileSystemOperationError("not_found", "The file was not found.")
      );
    }
    if (current.blobId !== request.blobId) {
      return new Err(
        new FileSystemOperationError(
          "stale",
          "The file changed while the commit response was in flight."
        )
      );
    }
    if (
      Number(current.size) !== request.expectedSizeBytes ||
      current.contentType !== request.contentType
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The committed content does not match the retry request."
        )
      );
    }

    return new Ok(current);
  }

  private async attachUploadedBlob(
    auth: Authenticator,
    scope: FileSystemScope,
    request: CommitContentUploadOptions,
    size: number,
    transaction: Transaction
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    const accessRes = this.checkContentAccess(auth, scope, { write: true });
    if (accessRes.isErr()) {
      return accessRes;
    }

    const cleanup = await FileSystemBlobCleanupResource.fetchForBlobForUpdate(
      auth,
      this,
      { blobId: request.blobId, transaction }
    );
    // A lost commit response is safe to retry with the same blob ID.
    if (this.blobId === request.blobId) {
      if (cleanup) {
        await cleanup.markBlobLive(auth, this, { transaction });
      }
      return new Ok(this);
    }
    if (this.blobId !== request.expectedBlobId) {
      return new Err(
        new FileSystemOperationError(
          "stale",
          "The file changed while content was uploading."
        )
      );
    }
    if (
      !cleanup ||
      !(await cleanup.markBlobLive(auth, this, { transaction }))
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The uploaded blob was not prepared for this file."
        )
      );
    }

    const replacedBlobId = this.blobId;
    await this.update(
      {
        blobId: request.blobId,
        size,
        contentType: request.contentType,
        contentRevision: this.contentRevision + 1,
      },
      transaction
    );
    if (replacedBlobId !== null) {
      await FileSystemBlobCleanupResource.retireBlob(auth, this, {
        blobId: replacedBlobId,
        transaction,
      });
    }

    return new Ok(this);
  }

  // Node rendering.

  toJSON(): FileSystemNodeType {
    return {
      id: this.id,
      parentId: this.parentId,
      rootKind: this.rootKind,
      rootId: this.rootId,
      name: this.name,
      kind: this.kind,
      mode: this.mode,
      size: Number(this.size),
      contentType: this.contentType,
      blobId: this.blobId,
      contentRevision: this.contentRevision,
      createdAtMs: this.createdAt.getTime(),
      modifiedAtMs: this.updatedAt.getTime(),
    };
  }
}
